import {
  corsHeaders,
  jsonResponse,
  getServiceClient,
} from "../_shared/auth.ts";

// ── Simple cron parser for "next run" calculation ──
function parseCronToNextRun(cronExpr: string, after: Date = new Date()): Date | null {
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minPart, hourPart, domPart, monPart, dowPart] = parts;

    function parseField(field: string, min: number, max: number): number[] {
      if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => i + min);
      const values: number[] = [];
      for (const segment of field.split(",")) {
        if (segment.includes("/")) {
          const [range, stepStr] = segment.split("/");
          const step = parseInt(stepStr);
          let start = min;
          let end = max;
          if (range !== "*") {
            const [s, e] = range.split("-").map(Number);
            start = s;
            if (e !== undefined) end = e;
          }
          for (let i = start; i <= end; i += step) values.push(i);
        } else if (segment.includes("-")) {
          const [s, e] = segment.split("-").map(Number);
          for (let i = s; i <= e; i++) values.push(i);
        } else {
          values.push(parseInt(segment));
        }
      }
      return values.filter((v) => v >= min && v <= max).sort((a, b) => a - b);
    }

    const minutes = parseField(minPart, 0, 59);
    const hours = parseField(hourPart, 0, 23);
    const daysOfMonth = parseField(domPart, 1, 31);
    const months = parseField(monPart, 1, 12);
    const daysOfWeek = parseField(dowPart, 0, 6);

    const candidate = new Date(after);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const maxIterations = 366 * 24 * 60;
    for (let i = 0; i < maxIterations; i++) {
      const m = candidate.getUTCMinutes();
      const h = candidate.getUTCHours();
      const dom = candidate.getUTCDate();
      const mon = candidate.getUTCMonth() + 1;
      const dow = candidate.getUTCDay();

      if (
        minutes.includes(m) &&
        hours.includes(h) &&
        months.includes(mon) &&
        (domPart === "*" || daysOfMonth.includes(dom)) &&
        (dowPart === "*" || daysOfWeek.includes(dow))
      ) {
        return candidate;
      }

      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // scheduler-tick is called by pg_cron (system), uses service role directly
    const sb = getServiceClient();

    console.log("[scheduler-tick] Processing due scheduled runs...");

    const now = new Date().toISOString();
    const { data: dueRuns, error: queryErr } = await sb
      .from("scheduled_runs")
      .select("*, workflows!inner(id, name, agent_id, org_id, trigger_config_json, is_active, description)")
      .lte("next_run_at", now)
      .eq("status", "pending")
      .eq("workflows.is_active", true)
      .limit(10);

    if (queryErr) {
      console.error("[scheduler-tick] Query error:", queryErr.message);
      return jsonResponse({ error: "Internal error" }, 500);
    }

    if (!dueRuns?.length) {
      console.log("[scheduler-tick] No due runs found");
      return jsonResponse({ processed: 0, errors: [], timestamp: now });
    }

    console.log(`[scheduler-tick] Found ${dueRuns.length} due run(s)`);

    const processed: string[] = [];
    const errors: string[] = [];

    for (const sr of dueRuns) {
      const workflow = (sr as any).workflows;
      const scheduledRunId = sr.id;

      try {
        await sb
          .from("scheduled_runs")
          .update({ status: "running" })
          .eq("id", scheduledRunId);

        const triggerConfig = workflow.trigger_config_json as any ?? {};
        const triggerPrompt = triggerConfig.prompt
          ?? triggerConfig.trigger_prompt
          ?? workflow.description
          ?? `Execute scheduled workflow: ${workflow.name}`;

        console.log(`[scheduler-tick] Triggering run-agent for workflow=${workflow.id}`);

        const runAgentResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/run-agent`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agent_id: workflow.agent_id ?? "default",
              message: triggerPrompt,
              org_id: workflow.org_id,
              source: "schedule",
            }),
          },
        );

        if (!runAgentResp.ok) {
          throw new Error(`run-agent returned ${runAgentResp.status}`);
        }

        // Consume body to avoid connection leak
        try {
          const reader = runAgentResp.body?.getReader();
          if (reader) {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          }
        } catch { /* ok */ }

        const cronExpr = triggerConfig.cron ?? triggerConfig.cron_expression ?? "0 * * * *";
        const nextRun = parseCronToNextRun(cronExpr);

        await sb
          .from("scheduled_runs")
          .update({
            status: "pending",
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun?.toISOString() ?? new Date(Date.now() + 3600_000).toISOString(),
          })
          .eq("id", scheduledRunId);

        processed.push(scheduledRunId);
        console.log(`[scheduler-tick] Processed workflow=${workflow.id}`);
      } catch (err: any) {
        console.error(`[scheduler-tick] Error processing scheduled_run=${scheduledRunId}:`, err.message);

        await sb
          .from("scheduled_runs")
          .update({ status: "failed" })
          .eq("id", scheduledRunId);

        errors.push(`${scheduledRunId}: processing failed`);
      }
    }

    return jsonResponse({
      processed: processed.length,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[scheduler-tick] Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
