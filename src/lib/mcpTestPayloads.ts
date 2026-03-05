/**
 * Predefined safe test payloads for each MCP tool.
 * Used by the MCP Test Dashboard to validate the pipeline end-to-end.
 */
export interface McpTestPayload {
  toolName: string;
  displayName: string;
  category: string;
  payload: Record<string, unknown>;
  description: string;
  /** If true, the mcp-test-runner will attempt a real API call */
  realApiAvailable?: boolean;
}

export const MCP_TEST_PAYLOADS: McpTestPayload[] = [
  // === Slack (real API via connector gateway) ===
  {
    toolName: "slack_list_channels",
    displayName: "Slack – List Channels",
    category: "messaging",
    payload: { limit: 10 },
    description: "Fetches available Slack channels via real API",
    realApiAvailable: true,
  },
  {
    toolName: "slack_send_message",
    displayName: "Slack – Send Message",
    category: "messaging",
    payload: { channel: "general", text: "MCP pipeline test 🤖" },
    description: "Sends a test message to #general",
    realApiAvailable: true,
  },
  // === Google Workspace (real API via Google OAuth) ===
  {
    toolName: "gmail_send_email",
    displayName: "Gmail – Send Email",
    category: "google-workspace",
    payload: { to: "test@test.com", subject: "MCP Pipeline Test", body: "Automated test" },
    description: "Send email dry-run (validates OAuth connection)",
    realApiAvailable: true,
  },
  {
    toolName: "gmail_read_inbox",
    displayName: "Gmail – Read Inbox",
    category: "google-workspace",
    payload: { query: "is:unread", limit: 5 },
    description: "Reads the 5 most recent unread emails",
    realApiAvailable: true,
  },
  {
    toolName: "gdrive_search",
    displayName: "Google Drive – Search",
    category: "google-workspace",
    payload: { query: "test", limit: 5 },
    description: "Searches Drive for files matching 'test'",
    realApiAvailable: true,
  },
  {
    toolName: "gdrive_upload",
    displayName: "Google Drive – Upload",
    category: "google-workspace",
    payload: { file_name: "mcp-test.txt", content: "MCP pipeline test file" },
    description: "Upload dry-run (validates OAuth connection)",
    realApiAvailable: true,
  },
  {
    toolName: "calendar_list_events",
    displayName: "Calendar – List Events",
    category: "google-workspace",
    payload: { days_ahead: 7, limit: 5 },
    description: "Lists upcoming calendar events for next 7 days",
    realApiAvailable: true,
  },
  {
    toolName: "calendar_create_event",
    displayName: "Calendar – Create Event",
    category: "google-workspace",
    payload: { title: "MCP Test Event", start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 90000000).toISOString() },
    description: "Create event dry-run (validates OAuth connection)",
    realApiAvailable: true,
  },
  // === Productivity (mock) ===
  {
    toolName: "notion_query_db",
    displayName: "Notion – Query Database",
    category: "productivity",
    payload: { database_id: "auto", limit: 5 },
    description: "Queries the first available Notion database",
  },
  {
    toolName: "notion_create_page",
    displayName: "Notion – Create Page",
    category: "productivity",
    payload: { database_id: "auto", title: "MCP Test Page" },
    description: "Creates a test page in the first available DB",
  },
  // === Automation (mock) ===
  {
    toolName: "n8n_trigger_webhook",
    displayName: "n8n – Trigger Workflow",
    category: "automation",
    payload: { webhook_url: "auto", payload: { test: true, source: "mcp-dashboard" } },
    description: "Triggers the first configured n8n webhook",
  },
  // === Productivity (mock) ===
  {
    toolName: "airtable_query",
    displayName: "Airtable – Query Records",
    category: "productivity",
    payload: { base_id: "auto", table_name: "auto", limit: 5 },
    description: "Lists records from the first available table",
  },
  {
    toolName: "airtable_create_record",
    displayName: "Airtable – Create Record",
    category: "productivity",
    payload: { base_id: "auto", table_name: "auto", fields: { Name: "MCP Test" } },
    description: "Creates a test record in the first available table",
  },
  // === Messaging (mock) ===
  {
    toolName: "whatsapp_send_message",
    displayName: "WhatsApp – Send Message",
    category: "messaging",
    payload: { to: "+0000000000", message: "MCP pipeline test" },
    description: "Sends a test WhatsApp message",
  },
  {
    toolName: "telegram_send_message",
    displayName: "Telegram – Send Message",
    category: "messaging",
    payload: { chat_id: "test", message: "MCP pipeline test" },
    description: "Sends a test Telegram message",
  },
  // === Social Media (mock) ===
  {
    toolName: "x_post_tweet",
    displayName: "X – Post Tweet",
    category: "social-media",
    payload: { text: "MCP pipeline test 🤖" },
    description: "Posts a test tweet",
  },
  {
    toolName: "x_read_mentions",
    displayName: "X – Read Mentions",
    category: "social-media",
    payload: { limit: 3 },
    description: "Reads the 3 most recent mentions",
  },
  {
    toolName: "instagram_post",
    displayName: "Instagram – Post",
    category: "social-media",
    payload: { image_url: "https://placehold.co/600x600", caption: "MCP test post" },
    description: "Publishes a test Instagram post",
  },
  {
    toolName: "facebook_post",
    displayName: "Facebook – Post",
    category: "social-media",
    payload: { page_id: "auto", message: "MCP pipeline test" },
    description: "Posts to the connected Facebook page",
  },
  // === Finance (mock) ===
  {
    toolName: "tradingview_get_alerts",
    displayName: "TradingView – Get Alerts",
    category: "finance",
    payload: { symbol: "BTCUSDT", limit: 5 },
    description: "Fetches alerts for BTCUSDT",
  },
];
