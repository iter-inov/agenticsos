import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Simple HMAC-SHA256 verification
async function verifyHmac(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256=${expected}` === signature || expected === signature;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const workflowId = url.searchParams.get("workflow_id");

    if (!workflowId) {
      return jsonResponse({ error: "Missing required parameter" }, 400);
    }

    // AUDIT FIX: Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(workflowId)) {
      return jsonResponse({ error: "Invalid parameter" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load workflow
    const { data: workflow, error: wfErr } = await sb
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("trigger_type", "webhook")
      .single();

    if (wfErr || !workflow) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (!workflow.is_active) {
      return jsonResponse({ error: "Workflow paused" }, 409);
    }

    // AUDIT FIX: HMAC signature is now REQUIRED for webhook triggers
    const { data: org } = await sb.from("orgs").select("webhook_secret").eq("id", workflow.org_id).single();
    const bodyText = await req.text();

    if (!org?.webhook_secret) {
      // AUDIT FIX: Require webhook_secret to be configured
      console.error(`[workflow-webhook] No webhook_secret for org ${workflow.org_id}`);
      return jsonResponse({ error: "Webhook not configured. Set a webhook secret in Settings." }, 403);
    }

    const signature = req.headers.get("x-webhook-signature") ?? req.headers.get("x-hub-signature-256") ?? "";
    if (!signature) {
      return jsonResponse({ error: "Missing signature" }, 401);
    }

    const valid = await verifyHmac(bodyText, signature, org.webhook_secret);
    if (!valid) {
      // Log failed attempt
      await sb.from("audit_logs").insert({
        org_id: workflow.org_id,
        event_type: "webhook_auth_failed",
        details_json: { workflow_id: workflowId },
      });
      return jsonResponse({ error: "Invalid signature" }, 401);
    }

    let webhookBody: any;
    try { webhookBody = JSON.parse(bodyText); } catch { webhookBody = { raw: bodyText }; }

    // Build prompt from webhook body + workflow config
    const triggerConfig = (workflow.trigger_config_json as any) ?? {};
    const basePrompt = triggerConfig.prompt ?? triggerConfig.trigger_prompt ?? workflow.description ?? "Process incoming webhook";
    const prompt = `${basePrompt}\n\nWebhook payload:\n${JSON.stringify(webhookBody, null, 2)}`;

    // Call run-agent
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
          message: prompt,
          org_id: workflow.org_id,
          source: "webhook",
        }),
      },
    );

    if (!runAgentResp.ok) {
      console.error("[workflow-webhook] run-agent failed");
      return jsonResponse({ error: "Execution failed" }, 500);
    }

    // Consume SSE to extract run_id
    let runId: string | null = null;
    try {
      const reader = runAgentResp.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const doneMatch = buffer.match(/"type"\s*:\s*"done".*?"run_id"\s*:\s*"([^"]+)"/);
          if (doneMatch) {
            runId = doneMatch[1];
          }
        }
      }
    } catch { /* ok */ }

    return jsonResponse({
      ok: true,
      run_id: runId,
      status: "triggered",
    });
  } catch (err: any) {
    console.error("[workflow-webhook] Error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
