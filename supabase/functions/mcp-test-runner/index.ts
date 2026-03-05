import {
  corsHeaders,
  resolveTenantContext,
  jsonResponse,
} from "../_shared/auth.ts";
import { CredentialManager } from "../_shared/credentials.ts";
import { TenantQuery } from "../_shared/tenant-query.ts";

const SLACK_GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

// ────── Token helper (delegates to CredentialManager) ──────
async function getGoogleAccessToken(creds: CredentialManager): Promise<string | null> {
  return creds.getGoogleAccessToken();
}

// ────── Real API handlers ──────
type ApiHandler = (args: any, creds: CredentialManager, tq: TenantQuery) => Promise<any>;

const REAL_API_TOOLS: Record<string, ApiHandler> = {
  slack_list_channels: async (args, creds) => {
    const env = creds.getEnvCredentials();
    const resp = await fetch(`${SLACK_GATEWAY_URL}/conversations.list?limit=${args.limit ?? 10}&exclude_archived=true`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": env.SLACK_API_KEY,
      },
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error("Slack API error");
    return {
      real_api: true,
      channels: (data.channels ?? []).slice(0, args.limit ?? 10).map((c: any) => ({
        id: c.id, name: c.name, is_member: c.is_member, num_members: c.num_members,
      })),
      total: data.channels?.length ?? 0,
    };
  },

  slack_send_message: async (args, creds) => {
    const env = creds.getEnvCredentials();
    let channelId = args.channel;
    if (channelId && !channelId.startsWith("C")) {
      const listResp = await fetch(`${SLACK_GATEWAY_URL}/conversations.list?limit=200&exclude_archived=true`, {
        headers: { Authorization: `Bearer ${env.LOVABLE_API_KEY}`, "X-Connection-Api-Key": env.SLACK_API_KEY },
      });
      const listData = await listResp.json();
      const found = (listData.channels ?? []).find((c: any) => c.name === channelId || c.name === channelId.replace("#", ""));
      if (found) channelId = found.id;
      else throw new Error("Channel not found");
    }
    const resp = await fetch(`${SLACK_GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": env.SLACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: channelId, text: args.text ?? "MCP test", username: "MCP Test Bot", icon_emoji: ":robot_face:" }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error("Slack API error");
    return { real_api: true, message_sent: true, channel: data.channel, ts: data.ts };
  },

  gmail_read_inbox: async (args, creds) => {
    const accessToken = await getGoogleAccessToken(creds);
    if (!accessToken) throw new Error("Google OAuth not connected");

    const query = args.query ? `&q=${encodeURIComponent(args.query)}` : "";
    const limit = args.limit ?? 5;

    const listResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listResp.json();
    if (!listResp.ok) throw new Error("Gmail API error");

    const messages = [];
    for (const msg of (listData.messages ?? []).slice(0, limit)) {
      const detailResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const detail = await detailResp.json();
      const headers = detail.payload?.headers ?? [];
      messages.push({
        id: msg.id,
        subject: headers.find((h: any) => h.name === "Subject")?.value ?? "(no subject)",
        from: headers.find((h: any) => h.name === "From")?.value ?? "",
        date: headers.find((h: any) => h.name === "Date")?.value ?? "",
      });
    }

    return { real_api: true, messages, total: listData.resultSizeEstimate ?? messages.length };
  },

  gmail_send_email: async (args, creds) => {
    const accessToken = await getGoogleAccessToken(creds);
    if (!accessToken) throw new Error("Google OAuth not connected");
    return { real_api: true, dry_run: true, message: `Would send email to ${args.to}. Use gmail_read_inbox for real API validation.` };
  },

  gdrive_search: async (args, creds) => {
    const accessToken = await getGoogleAccessToken(creds);
    if (!accessToken) throw new Error("Google OAuth not connected");

    const limit = args.limit ?? 5;
    const query = args.query ? `&q=name contains '${args.query}'` : "";
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?pageSize=${limit}&fields=files(id,name,mimeType,modifiedTime,size)${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error("Drive API error");

    return {
      real_api: true,
      files: (data.files ?? []).map((f: any) => ({
        id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime,
      })),
      total: data.files?.length ?? 0,
    };
  },

  gdrive_upload: async (args) => {
    return { real_api: true, dry_run: true, message: `Would upload "${args.file_name}". Use gdrive_search for real API validation.` };
  },

  calendar_list_events: async (args, creds) => {
    const accessToken = await getGoogleAccessToken(creds);
    if (!accessToken) throw new Error("Google OAuth not connected");

    const limit = args.limit ?? 5;
    const now = new Date().toISOString();
    const maxDate = new Date(Date.now() + (args.days_ahead ?? 7) * 86400000).toISOString();

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${limit}&timeMin=${now}&timeMax=${maxDate}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error("Calendar API error");

    return {
      real_api: true,
      events: (data.items ?? []).map((e: any) => ({
        id: e.id,
        title: e.summary ?? "(no title)",
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
      })),
      total: data.items?.length ?? 0,
    };
  },

  calendar_create_event: async (args) => {
    return { real_api: true, dry_run: true, message: `Would create event "${args.title}". Use calendar_list_events for real API validation.` };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Unified auth ──
    const body = await req.json();
    const ctx = await resolveTenantContext(req, body);
    if (ctx instanceof Response) return ctx;

    const { tool_name, test_payload } = body;
    if (!tool_name) {
      return jsonResponse({ error: "tool_name is required" }, 400);
    }

    // ── Instantiate tenant-scoped services ──
    const creds = new CredentialManager(ctx.orgId);
    const tq = new TenantQuery(ctx);

    const startTime = Date.now();

    // Check if this tool has a real API implementation
    const realHandler = REAL_API_TOOLS[tool_name];
    if (realHandler) {
      const env = creds.getEnvCredentials();

      if (tool_name.startsWith("slack_") && (!env.LOVABLE_API_KEY || !env.SLACK_API_KEY)) {
        const durationMs = Date.now() - startTime;
        await tq.insert("mcp_test_results", {
          tool_name, status: "error", request_payload: test_payload ?? {},
          response_preview: {}, duration_ms: durationMs,
          error_message: "Slack connector not configured.",
        });
        return jsonResponse({
          status: "auth_missing", tool_name, response: null, duration_ms: durationMs,
          error: "Slack connector not configured.", real_api: false,
        });
      }

      try {
        const response = await realHandler(test_payload ?? {}, creds, tq);
        const durationMs = Date.now() - startTime;

        await tq.insert("mcp_test_results", {
          tool_name, status: "success", request_payload: test_payload ?? {},
          response_preview: response, duration_ms: durationMs, error_message: null,
        });

        return jsonResponse({
          status: "success", tool_name, response, duration_ms: durationMs, error: null, real_api: true,
        });
      } catch (apiErr: any) {
        const durationMs = Date.now() - startTime;
        console.error(`[mcp-test-runner] ${tool_name} error:`, apiErr.message);

        await tq.insert("mcp_test_results", {
          tool_name, status: "error",
          request_payload: test_payload ?? {}, response_preview: {},
          duration_ms: durationMs, error_message: apiErr.message,
        });

        return jsonResponse({
          status: "error", tool_name, response: null,
          duration_ms: durationMs, error: "Tool test failed", real_api: true,
        });
      }
    }

    // Fallback: MCP pipeline test
    const { data: toolRow } = await tq.selectOne(
      "mcp_tools",
      "id, name, server_id, mcp_servers!inner(server_id, type, base_url)",
      { name: tool_name },
    );

    if (!toolRow) {
      const durationMs = Date.now() - startTime;
      await tq.insert("mcp_test_results", {
        tool_name, status: "config_missing", request_payload: test_payload ?? {},
        response_preview: {}, duration_ms: durationMs,
        error_message: `Tool "${tool_name}" not found.`,
      });
      return jsonResponse({
        status: "config_missing", tool_name, response: null, duration_ms: durationMs,
        error: `Tool "${tool_name}" not found.`, real_api: false,
      });
    }

    // Call MCP server
    const mcpUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mcp-server`;
    const mcpAuthToken = Deno.env.get("MCP_AUTH_TOKEN");
    let mcpResponse: any;
    let mcpError: string | null = null;

    try {
      const resp = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${mcpAuthToken}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0", id: crypto.randomUUID(),
          method: "tools/call", params: { name: tool_name, arguments: test_payload ?? {}, org_id: ctx.orgId },
        }),
      });

      const ct = resp.headers.get("content-type") ?? "";
      mcpResponse = ct.includes("text/event-stream")
        ? { sse: true, raw: await resp.text() }
        : await resp.json();

      if (!resp.ok) mcpError = "MCP server error";
    } catch (err: any) {
      console.error(`[mcp-test-runner] MCP call error:`, err.message);
      mcpError = "MCP server unavailable";
      mcpResponse = {};
    }

    const durationMs = Date.now() - startTime;
    const status = mcpError ? "error" : "success";

    await tq.insert("mcp_test_results", {
      tool_name, status, request_payload: test_payload ?? {},
      response_preview: mcpResponse, duration_ms: durationMs, error_message: mcpError,
    });

    return jsonResponse({
      status, tool_name, response: mcpResponse, duration_ms: durationMs, error: mcpError, real_api: false,
    });
  } catch (err: any) {
    console.error("[mcp-test-runner] Error:", err);
    return jsonResponse({ error: "Service error" }, 500);
  }
});
