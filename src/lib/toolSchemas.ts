import type { McpTool } from "./mcpSchema";

export interface ToolSchemaEntry {
  tools: McpTool[];
  category: string;
  serverLabel: string;
}

/**
 * Maps platform tool slugs to their MCP tool definitions.
 * Each slug can expose multiple actions (read / write).
 */
export const TOOL_SCHEMAS: Record<string, ToolSchemaEntry> = {
  slack: {
    category: "messaging",
    serverLabel: "Messaging",
    tools: [
      {
        name: "slack_list_channels",
        description: "List available Slack channels",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max channels to return (default 10)" },
          },
        },
      },
      {
        name: "slack_send_message",
        description: "Send a message to a Slack channel",
        risk_level: "medium",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel name or ID" },
            text: { type: "string", description: "Message text" },
          },
          required: ["channel", "text"],
        },
      },
    ],
  },

  gmail: {
    category: "google-workspace",
    serverLabel: "Google Workspace",
    tools: [
      {
        name: "gmail_send_email",
        description: "Send an email via Gmail",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject" },
            body: { type: "string", description: "Email body (plain text or HTML)" },
            cc: { type: "string", description: "CC recipients (comma-separated)" },
          },
          required: ["to", "subject", "body"],
        },
      },
      {
        name: "gmail_read_inbox",
        description: "Read recent emails from Gmail inbox",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Gmail search query (e.g. from:user@example.com)" },
            limit: { type: "number", description: "Max results (default 10)" },
          },
        },
      },
    ],
  },

  "google-drive": {
    category: "google-workspace",
    serverLabel: "Google Workspace",
    tools: [
      {
        name: "gdrive_search",
        description: "Search files in Google Drive",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results" },
          },
          required: ["query"],
        },
      },
      {
        name: "gdrive_upload",
        description: "Upload a file to Google Drive",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            file_name: { type: "string", description: "File name" },
            content: { type: "string", description: "File content (base64 or text)" },
            folder_id: { type: "string", description: "Target folder ID (optional)" },
          },
          required: ["file_name", "content"],
        },
      },
    ],
  },

  "google-calendar": {
    category: "google-workspace",
    serverLabel: "Google Workspace",
    tools: [
      {
        name: "calendar_create_event",
        description: "Create an event in Google Calendar",
        risk_level: "medium",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Event title" },
            start: { type: "string", description: "Start datetime (ISO 8601)" },
            end: { type: "string", description: "End datetime (ISO 8601)" },
            attendees: { type: "string", description: "Comma-separated emails" },
          },
          required: ["title", "start", "end"],
        },
      },
      {
        name: "calendar_list_events",
        description: "List upcoming Google Calendar events",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            days_ahead: { type: "number", description: "Number of days ahead (default 7)" },
            limit: { type: "number", description: "Max events to return" },
          },
        },
      },
    ],
  },

  notion: {
    category: "productivity",
    serverLabel: "Productivity Tools",
    tools: [
      {
        name: "notion_query_db",
        description: "Query a Notion database with filters",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            database_id: { type: "string", description: "Notion database ID" },
            filter: { type: "object", description: "Notion filter object" },
            limit: { type: "number", description: "Max results" },
          },
          required: ["database_id"],
        },
      },
      {
        name: "notion_create_page",
        description: "Create a new page in a Notion database",
        risk_level: "medium",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            database_id: { type: "string", description: "Target database ID" },
            title: { type: "string", description: "Page title" },
            properties: { type: "object", description: "Additional page properties" },
          },
          required: ["database_id", "title"],
        },
      },
    ],
  },

  n8n: {
    category: "automation",
    serverLabel: "Automation",
    tools: [
      {
        name: "n8n_trigger_webhook",
        description: "Trigger an n8n workflow via webhook",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            webhook_url: { type: "string", description: "n8n webhook URL" },
            payload: { type: "object", description: "JSON payload to send" },
          },
          required: ["webhook_url"],
        },
      },
    ],
  },

  airtable: {
    category: "productivity",
    serverLabel: "Productivity Tools",
    tools: [
      {
        name: "airtable_query",
        description: "Query records from an Airtable base",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            base_id: { type: "string", description: "Airtable base ID" },
            table_name: { type: "string", description: "Table name" },
            filter_formula: { type: "string", description: "Airtable formula filter" },
            limit: { type: "number", description: "Max records" },
          },
          required: ["base_id", "table_name"],
        },
      },
      {
        name: "airtable_create_record",
        description: "Create a new record in an Airtable table",
        risk_level: "medium",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            base_id: { type: "string", description: "Airtable base ID" },
            table_name: { type: "string", description: "Table name" },
            fields: { type: "object", description: "Field values for the new record" },
          },
          required: ["base_id", "table_name", "fields"],
        },
      },
    ],
  },

  whatsapp: {
    category: "messaging",
    serverLabel: "Messaging",
    tools: [
      {
        name: "whatsapp_send_message",
        description: "Send a WhatsApp message to a phone number",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Phone number (E.164 format)" },
            message: { type: "string", description: "Message content" },
          },
          required: ["to", "message"],
        },
      },
    ],
  },

  telegram: {
    category: "messaging",
    serverLabel: "Messaging",
    tools: [
      {
        name: "telegram_send_message",
        description: "Send a Telegram message to a chat",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            chat_id: { type: "string", description: "Telegram chat ID" },
            message: { type: "string", description: "Message text" },
          },
          required: ["chat_id", "message"],
        },
      },
    ],
  },

  x: {
    category: "social-media",
    serverLabel: "Social Media",
    tools: [
      {
        name: "x_post_tweet",
        description: "Post a tweet on X (Twitter)",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Tweet text (max 280 chars)" },
          },
          required: ["text"],
        },
      },
      {
        name: "x_read_mentions",
        description: "Read recent mentions on X",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max mentions to return" },
          },
        },
      },
    ],
  },

  instagram: {
    category: "social-media",
    serverLabel: "Social Media",
    tools: [
      {
        name: "instagram_post",
        description: "Publish a post on Instagram",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            image_url: { type: "string", description: "Image URL to post" },
            caption: { type: "string", description: "Post caption" },
          },
          required: ["image_url", "caption"],
        },
      },
    ],
  },

  facebook: {
    category: "social-media",
    serverLabel: "Social Media",
    tools: [
      {
        name: "facebook_post",
        description: "Publish a post on a Facebook page",
        risk_level: "high",
        requires_approval: true,
        input_schema: {
          type: "object",
          properties: {
            page_id: { type: "string", description: "Facebook page ID" },
            message: { type: "string", description: "Post message" },
            link: { type: "string", description: "Optional link to attach" },
          },
          required: ["page_id", "message"],
        },
      },
    ],
  },

  tradingview: {
    category: "finance",
    serverLabel: "Finance",
    tools: [
      {
        name: "tradingview_get_alerts",
        description: "Fetch active TradingView alerts",
        risk_level: "low",
        requires_approval: false,
        input_schema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Trading symbol (e.g. BTCUSD)" },
            limit: { type: "number", description: "Max alerts to return" },
          },
        },
      },
    ],
  },
};

/**
 * Generate an MCP config from a list of connected tool slugs.
 */
export function generateMcpFromTools(connectedSlugs: string[]): import("./mcpSchema").McpConfig {
  // Group tools by category → server
  const serverMap = new Map<string, { label: string; tools: McpTool[] }>();

  for (const slug of connectedSlugs) {
    const schema = TOOL_SCHEMAS[slug];
    if (!schema) continue;

    const existing = serverMap.get(schema.category);
    if (existing) {
      existing.tools.push(...schema.tools);
    } else {
      serverMap.set(schema.category, {
        label: schema.serverLabel,
        tools: [...schema.tools],
      });
    }
  }

  return {
    version: "1.0",
    workspace: { timezone: "UTC", default_model: "openai:gpt-4.1-mini" },
    servers: Array.from(serverMap.entries()).map(([id, s]) => ({
      id,
      label: s.label,
      type: "native" as const,
      tools: s.tools,
    })),
    policies: {
      pii_protection: { enabled: true, redact_in_logs: true },
      budget: { monthly_limit_usd: 100, hard_stop: true },
      approvals: {
        default_requires_approval: true,
        roles_allowed_to_approve: ["owner", "admin"],
      },
    },
  };
}
