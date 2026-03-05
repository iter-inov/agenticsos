import {
  corsHeaders,
  resolveTenantContext,
  getServiceClient,
} from "../_shared/auth.ts";
import { TenantQuery } from "../_shared/tenant-query.ts";

const MAX_TOOL_ITERATIONS = 10;
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const GLOBAL_TIMEOUT_MS = 55_000;

const MAX_CONCURRENT_RUNS_PER_ORG = 10;
const MAX_RUNS_PER_HOUR_PER_ORG = 100;

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── PII / Secret redaction ──
const REDACT_PATTERNS = [
  /(?:sk|pk|rk|xoxb|xoxp|xapp|ghp|gho|ghs|ghr|glpat|AKIA|ABIA|ACCA|ASIA|Bearer\s+)[A-Za-z0-9\-_\.]{10,}/gi,
  /(?:password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s"',}{]{6,}/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
];

function redactPII(input: unknown): unknown {
  if (typeof input === "string") {
    let result = input;
    for (const pattern of REDACT_PATTERNS) {
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }
  if (Array.isArray(input)) return input.map(redactPII);
  if (input && typeof input === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (lk.includes("token") || lk.includes("secret") || lk.includes("password") || lk.includes("key") || lk.includes("credential")) {
        obj[k] = "[REDACTED]";
      } else {
        obj[k] = redactPII(v);
      }
    }
    return obj;
  }
  return input;
}

function safeErrorMessage(err: any): string {
  const msg = err?.message ?? "An unexpected error occurred";
  return msg.replace(/\bat\s+.*$/gm, "").replace(/\/[^\s:]+/g, "").trim().slice(0, 200);
}

async function debugLog(sb: any, runId: string, step: string, details: any) {
  console.log(`[run-agent][DEBUG] ${step}:`, JSON.stringify(details));
  try {
    await sb.from("run_events").insert({
      run_id: runId,
      type: "log",
      payload_json: { debug: true, step, ...details },
    });
  } catch { /* non-blocking */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // ── Unified auth via shared module ──
    const body = await req.json();
    const ctx = await resolveTenantContext(req, body);
    if (ctx instanceof Response) return ctx;

    const { orgId, userId } = ctx;
    const sb = getServiceClient();
    const tq = new TenantQuery(ctx);

    // ── Parse body ──
    const agent_id = body.agent_id;
    const prompt = body.prompt ?? body.message;
    const conversation_id = body.conversation_id;
    const context = body.context;

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt/message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RATE LIMITING (using TenantQuery) ──
    const activeRunsCount = await tq.count("runs", { status: "running" })
      + await tq.count("runs", { status: "pending" });

    if (activeRunsCount >= MAX_CONCURRENT_RUNS_PER_ORG) {
      await tq.insert("audit_logs", {
        event_type: "rate_limit_concurrent",
        details_json: { active_runs: activeRunsCount, limit: MAX_CONCURRENT_RUNS_PER_ORG },
        user_id: userId === "system" ? null : userId,
      });
      return new Response(JSON.stringify({
        error: `Rate limit exceeded: maximum ${MAX_CONCURRENT_RUNS_PER_ORG} concurrent runs per organization.`,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" },
      });
    }

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count: hourlyCount } = await sb
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", oneHourAgo);

    if ((hourlyCount ?? 0) >= MAX_RUNS_PER_HOUR_PER_ORG) {
      await tq.insert("audit_logs", {
        event_type: "rate_limit_hourly",
        details_json: { hourly_runs: hourlyCount, limit: MAX_RUNS_PER_HOUR_PER_ORG },
        user_id: userId === "system" ? null : userId,
      });
      return new Response(JSON.stringify({
        error: `Rate limit exceeded: maximum ${MAX_RUNS_PER_HOUR_PER_ORG} runs per hour.`,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    // ── Workflow Builder detection ──
    const isWorkflowBuilder = context === "workflow_builder" || agent_id === "workflow-builder";

    // ── Step 1: Load agent ──
    let agent: any = null;
    if (agent_id && agent_id !== "default" && agent_id !== "workflow-builder") {
      const { data: agentRow } = await tq.selectOne("agents", "*", { id: agent_id });
      agent = agentRow;
    }

    // ── System prompt ──
    let systemPrompt: string;

    if (isWorkflowBuilder) {
      systemPrompt = `Tu es l'agent "Workflow Builder" d'Agentic OS. Tu aides les utilisateurs à créer, modifier et gérer des workflows d'automatisation via la conversation.

## Tes capacités
Tu as accès à ces outils :
- create_workflow : créer un nouveau workflow
- update_workflow : modifier un workflow existant
- activate_workflow : activer/désactiver un workflow
- run_workflow_now : lancer un workflow immédiatement
- list_workflows : lister les workflows existants
- list_agents : lister les agents disponibles
- list_connected_tools : voir les outils connectés (Slack, Gmail, etc.)

## Comportement
1. Quand l'utilisateur décrit une automatisation, pose des questions précises :
   - Fréquence/déclencheur (quand ?)
   - Canal de sortie (où envoyer le résultat ?)
   - Agent à utiliser (lequel ?)
2. Avant de créer, résume le workflow puis demande confirmation.
3. Après création, confirme avec le prochain run prévu.
4. Réponds toujours en français. Sois concis et conversationnel.

## Expressions cron courantes
- "chaque matin à 7h30" → "30 7 * * *"
- "tous les lundis à 9h" → "0 9 * * 1"
- "lun-ven à 9h" → "0 9 * * 1-5"

## Règles
- Ne crée JAMAIS un workflow sans confirmation explicite de l'utilisateur.
- Utilise list_agents et list_connected_tools pour vérifier les agents et outils disponibles AVANT de proposer un workflow.`;
    } else {
      systemPrompt = agent?.role_prompt ??
        "You are a helpful AI assistant. You have access to tools when available. Be concise, precise, and helpful.";
    }

    // ── Load agent tools with risk/approval info ──
    let toolDefs: any[] = [];
    let openAiTools: any[] = [];
    let toolLoadSource = "none";

    if (agent) {
      const { data: agentToolRows } = await sb
        .from("agent_tools")
        .select("mcp_tool_id, permissions_json, mcp_tools(id, name, description, input_schema, risk_level, requires_approval)")
        .eq("agent_id", agent.id)
        .not("mcp_tool_id", "is", null);

      if (agentToolRows?.length) {
        toolLoadSource = "agent_tools_via_mcp_tool_id";
        toolDefs = agentToolRows.map((r: any) => r.mcp_tools).filter(Boolean);
        openAiTools = toolDefs.map((t: any) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description ?? "",
            parameters: t.input_schema ?? { type: "object", properties: {} },
          },
        }));
      }
    }

    // Fallback: load all org mcp_tools
    if (!openAiTools.length) {
      const { data: orgTools } = await tq.select(
        "mcp_tools",
        "name, description, input_schema, risk_level, requires_approval",
      );

      if (orgTools?.length) {
        toolLoadSource = "mcp_tools_fallback";
        toolDefs = orgTools;
        openAiTools = orgTools.map((t: any) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description ?? "",
            parameters: t.input_schema ?? { type: "object", properties: {} },
          },
        }));
      }
    }

    // ── Inject Workflow Builder tools if in workflow context ──
    if (isWorkflowBuilder) {
      const wfBuilderTools = [
        { name: "create_workflow", description: "Crée un nouveau workflow d'automatisation", input_schema: { type: "object", properties: { name: { type: "string" }, trigger_type: { type: "string", enum: ["cron", "webhook", "event", "manual"] }, cron_expr: { type: "string" }, trigger_config: { type: "object" }, agent_id: { type: "string" }, trigger_prompt: { type: "string" }, steps: { type: "array", items: { type: "object", properties: { action_type: { type: "string" }, config: { type: "object" } } } } }, required: ["name", "trigger_type", "agent_id", "trigger_prompt"] } },
        { name: "update_workflow", description: "Modifie un workflow existant", input_schema: { type: "object", properties: { workflow_id: { type: "string" }, changes: { type: "object" } }, required: ["workflow_id", "changes"] } },
        { name: "activate_workflow", description: "Active ou désactive un workflow", input_schema: { type: "object", properties: { workflow_id: { type: "string" }, active: { type: "boolean" } }, required: ["workflow_id"] } },
        { name: "run_workflow_now", description: "Lance un workflow immédiatement", input_schema: { type: "object", properties: { workflow_id: { type: "string" } }, required: ["workflow_id"] } },
        { name: "list_workflows", description: "Liste les workflows de l'organisation", input_schema: { type: "object", properties: { limit: { type: "number" } } } },
        { name: "list_agents", description: "Liste les agents actifs disponibles", input_schema: { type: "object", properties: { limit: { type: "number" } } } },
        { name: "list_connected_tools", description: "Liste les outils connectés", input_schema: { type: "object", properties: {} } },
      ];
      toolLoadSource = "workflow_builder_system";
      toolDefs = wfBuilderTools;
      openAiTools = wfBuilderTools.map(t => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    const { data: policy } = await tq.selectOne("policies", "rules_json, mode");
    const securityMode = policy?.mode ?? "medium";
    const rulesJson = (policy?.rules_json ?? {}) as any;
    const maxTokensPerRun = rulesJson.max_tokens_per_run ?? 10000;

    // ── Load budget ──
    const { data: budgetRow } = await tq.selectOne("budgets", "monthly_limit, hard_stop");
    const monthlyLimit = budgetRow?.monthly_limit ?? 50;
    const hardStop = budgetRow?.hard_stop ?? true;

    // ── Budget check ──
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const { data: monthUsage } = await sb
      .from("usage_daily")
      .select("cost")
      .eq("org_id", orgId)
      .gte("date", monthStart);

    const currentMonthCost = (monthUsage ?? []).reduce((s: number, u: any) => s + (Number(u.cost) || 0), 0);

    // Create run record
    const runId = crypto.randomUUID();
    await sb.from("runs").insert({
      id: runId,
      org_id: orgId,
      agent_id: agent?.id ?? null,
      conversation_id: conversation_id ?? null,
      source: body.source ?? "chat",
      status: "running",
      started_at: new Date().toISOString(),
    });

    await debugLog(sb, runId, "tools_loaded", {
      source: toolLoadSource,
      agent_id: agent?.id ?? null,
      tool_names: openAiTools.map((t: any) => t.function.name),
      tool_count: openAiTools.length,
    });

    await sb.from("run_events").insert({
      run_id: runId,
      type: "policy_check",
      payload_json: redactPII({
        security_mode: securityMode,
        budget: { monthly_limit: monthlyLimit, current: currentMonthCost, hard_stop: hardStop },
        tools_count: openAiTools.length,
      }),
    });

    if (hardStop && currentMonthCost >= monthlyLimit) {
      await sb.from("runs").update({
        status: "failed",
        error_message: "Monthly budget exceeded",
        finished_at: new Date().toISOString(),
      }).eq("id", runId);

      return new Response(JSON.stringify({ error: "Monthly budget exceeded. Contact your admin." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Load conversation history ──
    let conversationMessages: { role: string; content: string }[] = [];
    if (conversation_id) {
      const { data: conv } = await tq.selectOne("conversations", "id", { id: conversation_id });
      if (conv) {
        const { data: history } = await sb
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversation_id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (history?.length) {
          conversationMessages = history.reverse().map((m: any) => ({
            role: m.role === "system" ? "user" : m.role,
            content: m.content,
          }));
        }
      }
    }

    if (conversation_id) {
      await sb.from("messages").insert({ conversation_id, role: "user", content: prompt });
    }

    // ── SSE stream ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await sb.from("runs").update({ status: "failed", error_message: "AI gateway not configured" }).eq("id", runId);
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCost = 0;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let llmMessages: any[] = [
            { role: "system", content: systemPrompt },
            ...conversationMessages,
            { role: "user", content: prompt },
          ];

          let fullResponse = "";
          let iteration = 0;
          let awaitingApproval = false;

          while (iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            if (Date.now() - startTime > GLOBAL_TIMEOUT_MS) {
              controller.enqueue(encoder.encode(sseEvent({ type: "error", error: "Request timeout" })));
              break;
            }

            await debugLog(sb, runId, "llm_request", {
              iteration,
              model: DEFAULT_MODEL,
              tools_sent: openAiTools.map((t: any) => t.function.name),
              tools_count: openAiTools.length,
              message_count: llmMessages.length,
            });

            const llmBody: any = {
              model: DEFAULT_MODEL,
              messages: llmMessages,
              stream: true,
              max_tokens: Math.min(maxTokensPerRun, 4096),
            };

            if (openAiTools.length > 0) {
              llmBody.tools = openAiTools;
            }

            let llmResp: Response;
            try {
              llmResp = await fetch(AI_GATEWAY_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(llmBody),
              });
            } catch (fetchErr: any) {
              console.error("[run-agent] LLM fetch error:", fetchErr.message);
              await new Promise(r => setTimeout(r, 2000));
              llmResp = await fetch(AI_GATEWAY_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(llmBody),
              });
            }

            if (!llmResp.ok) {
              const errText = await llmResp.text();
              console.error("[run-agent] LLM error:", llmResp.status, errText);

              if (llmResp.status === 429 && iteration === 1) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
              }

              const errorMsg = llmResp.status === 429
                ? "Service busy. Please try again shortly."
                : llmResp.status === 402
                ? "Service quota reached. Please contact support."
                : "AI service temporarily unavailable";

              controller.enqueue(encoder.encode(sseEvent({ type: "error", error: errorMsg })));
              await sb.from("runs").update({ status: "failed", error_message: `LLM error ${llmResp.status}`, finished_at: new Date().toISOString() }).eq("id", runId);
              break;
            }

            await sb.from("run_events").insert({
              run_id: runId,
              type: "llm_call",
              payload_json: { model: DEFAULT_MODEL, iteration, tools_count: openAiTools.length },
            });

            // ── Parse streaming response ──
            const reader = llmResp.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let iterationContent = "";
            let toolCalls: any[] = [];
            let streamDone = false;
            let finishReason = "";

            while (!streamDone) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              let newlineIdx: number;
              while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
                let line = buffer.slice(0, newlineIdx);
                buffer = buffer.slice(newlineIdx + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;

                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]") { streamDone = true; break; }

                try {
                  const parsed = JSON.parse(jsonStr);
                  const choice = parsed.choices?.[0];
                  if (!choice) continue;

                  if (parsed.usage) {
                    totalTokensIn += parsed.usage.prompt_tokens ?? 0;
                    totalTokensOut += parsed.usage.completion_tokens ?? 0;
                  }

                  const delta = choice.delta;

                  if (delta?.content) {
                    iterationContent += delta.content;
                    fullResponse += delta.content;
                    controller.enqueue(encoder.encode(sseEvent({ type: "token", content: delta.content })));
                  }

                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCalls[idx]) {
                        toolCalls[idx] = { id: tc.id ?? "", function: { name: "", arguments: "" } };
                      }
                      if (tc.id) toolCalls[idx].id = tc.id;
                      if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                      if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                  }

                  if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                    if (choice.finish_reason === "stop" || choice.finish_reason === "tool_calls") {
                      streamDone = true;
                    }
                  }
                } catch {
                  // partial JSON
                }
              }
            }

            await debugLog(sb, runId, "llm_response", {
              iteration,
              finish_reason: finishReason,
              tool_calls_count: toolCalls.length,
              tool_calls_requested: toolCalls.map(tc => tc.function.name),
              content_length: iterationContent.length,
            });

            if (toolCalls.length === 0) break;

            // ── Execute tool calls ──
            const assistantMsg: any = { role: "assistant", content: iterationContent || null };
            assistantMsg.tool_calls = toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.function.name, arguments: tc.function.arguments },
            }));
            llmMessages.push(assistantMsg);

            for (const tc of toolCalls) {
              const toolName = tc.function.name;
              let toolArgs: any = {};
              try { toolArgs = JSON.parse(tc.function.arguments); } catch { /* empty */ }

              const toolMeta = toolDefs.find((t: any) => t.name === toolName);
              if (toolMeta?.requires_approval && securityMode !== "low") {
                await tq.insert("approvals", {
                  run_id: runId,
                  reason: `Tool "${toolName}" requires approval (risk: ${toolMeta.risk_level})`,
                  required: true,
                });

                await sb.from("run_events").insert({
                  run_id: runId,
                  type: "approval_required",
                  payload_json: { tool: toolName, risk_level: toolMeta.risk_level },
                });

                controller.enqueue(encoder.encode(sseEvent({
                  type: "awaiting_approval",
                  tool: toolName,
                  run_id: runId,
                  message: `Tool "${toolName}" requires approval before execution.`,
                })));

                awaitingApproval = true;
                break;
              }

              controller.enqueue(encoder.encode(sseEvent({ type: "tool_call", name: toolName, args: redactPII(toolArgs) })));

              await sb.from("run_events").insert({
                run_id: runId,
                type: "tool_call",
                payload_json: redactPII({ tool: toolName, args: toolArgs }),
              });

              // Execute via tool-proxy
              let toolResult: any;
              const toolStart = Date.now();
              try {
                const proxyResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-proxy`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      tool_slug: toolName,
                      action: "execute",
                      args: toolArgs,
                      run_id: runId,
                      internal: true,
                      org_id: orgId,
                    }),
                  },
                );
                toolResult = await proxyResp.json();
              } catch (err: any) {
                toolResult = { ok: false, error: "Tool execution failed" };
                console.error(`[run-agent] tool-proxy error for ${toolName}:`, err.message);
              }

              const toolDuration = Date.now() - toolStart;

              await debugLog(sb, runId, "tool_proxy_response", {
                tool_name: toolName,
                ok: toolResult?.ok ?? false,
                duration_ms: toolDuration,
              });

              await sb.from("run_events").insert({
                run_id: runId,
                type: "tool_call",
                payload_json: redactPII({
                  tool: toolName,
                  direction: "result",
                  ok: toolResult?.ok ?? false,
                  error: toolResult?.error ?? null,
                }),
                duration_ms: toolDuration,
              });

              controller.enqueue(encoder.encode(sseEvent({
                type: "tool_result",
                name: toolName,
                result: toolResult?.data ?? toolResult,
              })));

              const resultContent = toolResult?.ok
                ? JSON.stringify(toolResult.data)
                : JSON.stringify({ error: toolResult?.error ?? "Tool execution failed" });

              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: resultContent,
              });
            }

            if (awaitingApproval) {
              await sb.from("runs").update({ status: "pending", error_message: "Awaiting tool approval" }).eq("id", runId);
              break;
            }

            fullResponse = "";
          }

          // ── Finalization ──
          totalCost = (totalTokensIn * 0.0000001 + totalTokensOut * 0.0000004);

          if (!awaitingApproval) {
            if (conversation_id && fullResponse) {
              await sb.from("messages").insert({
                conversation_id,
                role: "assistant",
                content: fullResponse,
                token_count: totalTokensIn + totalTokensOut,
                cost_estimate: totalCost,
              });
            }

            await sb.from("runs").update({
              status: "completed",
              finished_at: new Date().toISOString(),
              total_tokens: totalTokensIn + totalTokensOut,
              total_cost: totalCost,
            }).eq("id", runId);

            // Upsert usage_daily
            const today = new Date().toISOString().slice(0, 10);
            await tq.upsert("usage_daily", {
              date: today,
              cost: totalCost,
              tokens_in: totalTokensIn,
              tokens_out: totalTokensOut,
            }, "org_id,date").catch(() => {
              // Fallback: try update then insert
              sb.from("usage_daily")
                .select("id, cost, tokens_in, tokens_out")
                .eq("org_id", orgId)
                .eq("date", today)
                .single()
                .then(({ data: existing }) => {
                  if (existing) {
                    sb.from("usage_daily").update({
                      cost: (Number(existing.cost) || 0) + totalCost,
                      tokens_in: (existing.tokens_in || 0) + totalTokensIn,
                      tokens_out: (existing.tokens_out || 0) + totalTokensOut,
                    }).eq("id", existing.id);
                  } else {
                    sb.from("usage_daily").insert({
                      org_id: orgId, date: today, cost: totalCost,
                      tokens_in: totalTokensIn, tokens_out: totalTokensOut,
                    });
                  }
                });
            });

            // Upsert usage_by_agent_daily
            if (agent?.id) {
              const today = new Date().toISOString().slice(0, 10);
              const { data: existingAgentUsage } = await sb
                .from("usage_by_agent_daily")
                .select("id, cost, tokens")
                .eq("org_id", orgId)
                .eq("agent_id", agent.id)
                .eq("date", today)
                .single();

              if (existingAgentUsage) {
                await sb.from("usage_by_agent_daily").update({
                  cost: (Number(existingAgentUsage.cost) || 0) + totalCost,
                  tokens: (existingAgentUsage.tokens || 0) + totalTokensIn + totalTokensOut,
                }).eq("id", existingAgentUsage.id);
              } else {
                await sb.from("usage_by_agent_daily").insert({
                  org_id: orgId, agent_id: agent.id, date: today,
                  cost: totalCost, tokens: totalTokensIn + totalTokensOut,
                });
              }
            }

            await sb.from("run_events").insert({
              run_id: runId,
              type: "log",
              payload_json: { message: "Run completed", tokens_in: totalTokensIn, tokens_out: totalTokensOut, duration_ms: Date.now() - startTime },
              tokens_used: totalTokensIn + totalTokensOut,
              cost: totalCost,
            });
          }

          controller.enqueue(encoder.encode(sseEvent({
            type: "done",
            run_id: runId,
            tokens: { in: totalTokensIn, out: totalTokensOut },
            cost: totalCost,
            status: awaitingApproval ? "awaiting_approval" : "completed",
          })));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err: any) {
          console.error("[run-agent] Stream error:", err);
          controller.enqueue(encoder.encode(sseEvent({ type: "error", error: "An unexpected error occurred. Please try again." })));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          await sb.from("runs").update({
            status: "failed",
            error_message: safeErrorMessage(err),
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[run-agent] Error:", err);
    return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
