export interface McpConfig {
  version: string;
  workspace?: {
    timezone?: string;
    default_model?: string;
  };
  servers: McpServer[];
  policies?: McpPolicies;
}

export interface McpServer {
  id: string;
  label: string;
  type: "native" | "webhook" | "mcp";
  base_url?: string;
  tools: McpTool[];
}

export interface McpTool {
  name: string;
  description: string;
  risk_level: "low" | "medium" | "high";
  requires_approval: boolean;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpPolicies {
  pii_protection?: { enabled: boolean; redact_in_logs: boolean };
  budget?: { monthly_limit_usd: number; hard_stop: boolean };
  approvals?: {
    default_requires_approval: boolean;
    roles_allowed_to_approve: string[];
  };
}

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export function validateMcpConfig(json: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!json || typeof json !== "object") {
    errors.push({ path: "$", message: "Root must be an object", severity: "error" });
    return errors;
  }

  const cfg = json as Record<string, any>;

  if (!cfg.version) errors.push({ path: "$.version", message: "version is required", severity: "error" });

  if (!Array.isArray(cfg.servers) || cfg.servers.length === 0) {
    errors.push({ path: "$.servers", message: "servers[] must be a non-empty array", severity: "error" });
    return errors;
  }

  const serverIds = new Set<string>();
  const globalToolNames = new Set<string>();

  cfg.servers.forEach((server: any, si: number) => {
    const sp = `$.servers[${si}]`;
    if (!server.id) errors.push({ path: `${sp}.id`, message: "server.id is required", severity: "error" });
    if (serverIds.has(server.id)) errors.push({ path: `${sp}.id`, message: `Duplicate server id "${server.id}"`, severity: "error" });
    serverIds.add(server.id);

    if (!server.label) errors.push({ path: `${sp}.label`, message: "server.label is required", severity: "error" });

    if (!Array.isArray(server.tools)) {
      errors.push({ path: `${sp}.tools`, message: "server.tools must be an array", severity: "error" });
      return;
    }

    server.tools.forEach((tool: any, ti: number) => {
      const tp = `${sp}.tools[${ti}]`;
      if (!tool.name) errors.push({ path: `${tp}.name`, message: "tool.name is required", severity: "error" });
      if (globalToolNames.has(tool.name)) errors.push({ path: `${tp}.name`, message: `Duplicate tool name "${tool.name}"`, severity: "error" });
      globalToolNames.add(tool.name);

      if (!["low", "medium", "high"].includes(tool.risk_level)) {
        errors.push({ path: `${tp}.risk_level`, message: "risk_level must be low|medium|high", severity: "error" });
      }

      if (typeof tool.requires_approval !== "boolean") {
        errors.push({ path: `${tp}.requires_approval`, message: "requires_approval must be boolean", severity: "error" });
      }

      if (tool.risk_level === "high" && !tool.requires_approval) {
        errors.push({ path: `${tp}.requires_approval`, message: "High-risk tools must require approval", severity: "warning" });
      }

      if (tool.input_schema) {
        if (tool.input_schema.type !== "object") {
          errors.push({ path: `${tp}.input_schema.type`, message: "input_schema.type must be 'object'", severity: "error" });
        }
      }
    });
  });

  if (cfg.policies?.budget) {
    if (cfg.policies.budget.hard_stop && (!cfg.policies.budget.monthly_limit_usd || cfg.policies.budget.monthly_limit_usd <= 0)) {
      errors.push({ path: "$.policies.budget", message: "hard_stop requires monthly_limit_usd > 0", severity: "error" });
    }
  }

  return errors;
}

export const MCP_TEMPLATE: McpConfig = {
  version: "1.0",
  workspace: {
    timezone: "UTC",
    default_model: "openai:gpt-4.1-mini",
  },
  servers: [
    {
      id: "google",
      label: "Google Workspace",
      type: "native",
      tools: [
        {
          name: "gmail_send_email",
          description: "Send an email via Gmail",
          risk_level: "high",
          requires_approval: true,
          input_schema: {
            type: "object",
            properties: {
              to: { type: "string" },
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["to", "subject", "body"],
          },
        },
      ],
    },
  ],
  policies: {
    pii_protection: { enabled: true, redact_in_logs: true },
    budget: { monthly_limit_usd: 100, hard_stop: true },
    approvals: { default_requires_approval: true, roles_allowed_to_approve: ["owner", "admin"] },
  },
};
