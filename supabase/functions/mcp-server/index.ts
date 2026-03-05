import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import {
  corsHeaders,
  getServiceClient,
} from "../_shared/auth.ts";
import { TenantQuery } from "../_shared/tenant-query.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";

// ── Auth helper ──────────────────────────────────────────────────────
function validateAuth(req: Request): boolean {
  const header = req.headers.get("Authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  // Accept service role key
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && bearer === serviceKey) return true;
  // Accept any valid Supabase JWT
  if (bearer && bearer.includes(".")) {
    try {
      const payload = JSON.parse(atob(bearer.split(".")[1]));
      if (payload.iss?.includes("supabase")) return true;
    } catch { /* not a JWT */ }
  }
  // Accept MCP auth token
  const expected = Deno.env.get("MCP_AUTH_TOKEN");
  if (!expected) return false;
  return bearer === expected;
}

// ── Dynamic MCP Server builder (org-scoped) ──────────────────────────
async function buildMcpServer(orgId: string | null): Promise<McpServer> {
  const mcpServer = new McpServer({
    name: "agentplace-mcp",
    version: "1.0.0",
  });

  if (orgId) {
    const tq = new TenantQuery(orgId);

    // Load tools ONLY for the specified org via TenantQuery
    const sb = getServiceClient();
    const { data: tools } = await sb
      .from("mcp_tools")
      .select("*, mcp_servers!inner(server_id, type, base_url, label)")
      .eq("org_id", orgId)
      .order("name");

    if (tools && tools.length > 0) {
      for (const tool of tools) {
        try {
          const schema = (tool.input_schema && typeof tool.input_schema === "object")
            ? tool.input_schema as Record<string, unknown>
            : { type: "object", properties: {} };
          mcpServer.tool(tool.name, {
            description: tool.description ?? `Tool: ${tool.name}`,
            inputSchema: schema,
            handler: async (args: Record<string, any>) => {
              const proxyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tool-proxy`;

              try {
                const resp = await fetch(proxyUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({
                    tool_slug: tool.name,
                    action: "execute",
                    args,
                    internal: true,
                    org_id: orgId,
                  }),
                });

                const data = await resp.json();
                return {
                  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
                };
              } catch (err: any) {
                return {
                  content: [{ type: "text" as const, text: JSON.stringify({ error: "Tool execution failed" }) }],
                  isError: true,
                };
              }
            },
          });
        } catch (regErr: any) {
          console.error(`Failed to register tool "${tool.name}":`, regErr.message);
        }
      }
    }
  }

  // query_data tool — org-scoped via TenantQuery
  mcpServer.tool("query_data", {
    description:
      "Read data from the project database. Specify a table name and optional filters to retrieve rows.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: "Table to query. Allowed: agents, workflows, runs, mcp_tools",
          enum: ["agents", "workflows", "runs", "mcp_tools"],
        },
        filters: { type: "object", description: 'Key-value pairs for equality filters (org_id is auto-set)' },
        limit: { type: "number", description: "Maximum rows to return (default 25, max 100)" },
        select: { type: "string", description: 'Columns to select (default "*"). Use allowlisted columns only.' },
      },
      required: ["table"],
    },
    handler: async (args: { table: string; filters?: Record<string, string>; limit?: number; select?: string }) => {
      const tableAllowlist: Record<string, string[]> = {
        agents: ["id", "name", "status", "created_at", "updated_at", "org_id"],
        workflows: ["id", "name", "description", "is_active", "trigger_type", "created_at", "org_id"],
        runs: ["id", "status", "source", "created_at", "started_at", "finished_at", "total_tokens", "total_cost", "agent_id", "org_id"],
        mcp_tools: ["id", "name", "description", "risk_level", "requires_approval", "server_id", "org_id"],
      };

      if (!tableAllowlist[args.table]) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Table "${args.table}" not allowed. Allowed: ${Object.keys(tableAllowlist).join(", ")}` }) }],
          isError: true,
        };
      }

      if (!orgId) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "No org context available" }) }],
          isError: true,
        };
      }

      // Validate select columns
      const allowedCols = tableAllowlist[args.table];
      let selectStr = "*";
      if (args.select && args.select !== "*") {
        const requestedCols = args.select.split(",").map(c => c.trim());
        const invalid = requestedCols.filter(c => !allowedCols.includes(c));
        if (invalid.length > 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Columns not allowed: ${invalid.join(", ")}` }) }],
            isError: true,
          };
        }
        selectStr = requestedCols.join(",");
      }

      // Validate filter keys
      if (args.filters) {
        const invalidFilters = Object.keys(args.filters).filter(k => k !== "org_id" && !allowedCols.includes(k));
        if (invalidFilters.length > 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Filter columns not allowed: ${invalidFilters.join(", ")}` }) }],
            isError: true,
          };
        }
      }

      // Use TenantQuery for org-scoped access
      const tq = new TenantQuery(orgId);
      const safeLimit = Math.min(args.limit ?? 25, 100);
      const safeFilters: Record<string, unknown> = {};
      if (args.filters) {
        for (const [key, value] of Object.entries(args.filters)) {
          if (key === "org_id") continue;
          safeFilters[key] = value;
        }
      }

      const { data, error } = await tq.select(args.table, selectStr, safeFilters, { limit: safeLimit });
      if (error) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Query failed" }) }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ rows: data, count: data?.length ?? 0 }, null, 2) }] };
    },
  });

  return mcpServer;
}

// ── Hono app ─────────────────────────────────────────────────────────
const app = new Hono();

app.options("/*", (c) => {
  return new Response(null, { headers: corsHeaders });
});

app.get("/debug", (c) => {
  return new Response(JSON.stringify({ status: "ok", version: "1.0.0" }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// Auth middleware
app.use("/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const path = new URL(c.req.url).pathname;
  if (path.endsWith("/debug")) return next();
  if (!validateAuth(c.req.raw)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  await next();
});

// MCP handler
app.all("/*", async (c) => {
  const url = new URL(c.req.url);
  let orgId = url.searchParams.get("org_id");

  let requestBody: any = null;
  if (c.req.method === "POST") {
    try {
      requestBody = await c.req.json();
      if (!orgId) {
        orgId = requestBody.params?.org_id ?? null;
      }
    } catch {
      // not JSON
    }
  }

  // Rate limit check (per-org) using shared rate limiter
  if (orgId) {
    const rl = await checkRateLimit(orgId, "mcp_request");
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", limit: rl.limit, current: rl.current }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        },
      );
    }
  }

  const mcpServer = await buildMcpServer(orgId);
  const transport = new StreamableHttpTransport();
  const handler = transport.bind(mcpServer);

  const req = requestBody
    ? new Request(c.req.url, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: JSON.stringify(requestBody),
      })
    : c.req.raw;

  const response = await handler(req);
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
});

Deno.serve(app.fetch);
