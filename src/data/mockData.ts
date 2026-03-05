// ========== AGENTS ==========
export interface Agent {
  id: string;
  name: string;
  rolePrompt: string;
  status: "active" | "paused";
  tokensUsed: number;
  workflowCount: number;
  securityLevel: "low" | "medium" | "high";
  lastExecution: string;
  defaultModel: string;
  tools: string[];
}

export const mockAgents: Agent[] = [
  {
    id: "a1",
    name: "Content Writer",
    rolePrompt: "You are a professional content writer specializing in tech and SaaS marketing copy.",
    status: "active",
    tokensUsed: 284500,
    workflowCount: 3,
    securityLevel: "medium",
    lastExecution: "2 min ago",
    defaultModel: "GPT-4o",
    tools: ["gmail", "notion", "x"],
  },
  {
    id: "a2",
    name: "Data Analyst",
    rolePrompt: "You analyze business data, generate insights, and create summary reports.",
    status: "active",
    tokensUsed: 512300,
    workflowCount: 2,
    securityLevel: "high",
    lastExecution: "15 min ago",
    defaultModel: "Claude 3.5 Sonnet",
    tools: ["airtable", "notion", "google-drive"],
  },
  {
    id: "a3",
    name: "Social Media Manager",
    rolePrompt: "You manage and schedule social media posts across multiple platforms.",
    status: "paused",
    tokensUsed: 98200,
    workflowCount: 5,
    securityLevel: "low",
    lastExecution: "3 hours ago",
    defaultModel: "Gemini 2.5 Flash",
    tools: ["x", "instagram", "facebook", "telegram"],
  },
  {
    id: "a4",
    name: "Customer Support Bot",
    rolePrompt: "You handle customer inquiries, troubleshoot issues, and escalate when needed.",
    status: "active",
    tokensUsed: 1240000,
    workflowCount: 1,
    securityLevel: "high",
    lastExecution: "Just now",
    defaultModel: "GPT-4o",
    tools: ["gmail", "whatsapp", "notion"],
  },
];

// ========== TOOLS ==========
export interface Tool {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon: string;
  connected: boolean;
  description: string;
}

export const mockTools: Tool[] = [
  { id: "t1", slug: "gmail", name: "Gmail", category: "Google Workspace", icon: "Mail", connected: true, description: "Send and read emails" },
  { id: "t2", slug: "google-drive", name: "Google Drive", category: "Google Workspace", icon: "HardDrive", connected: true, description: "Access and manage files" },
  { id: "t3", slug: "google-calendar", name: "Google Calendar", category: "Google Workspace", icon: "Calendar", connected: false, description: "Manage events and scheduling" },
  { id: "t4", slug: "notion", name: "Notion", category: "Productivity", icon: "FileText", connected: true, description: "Notes, docs and databases" },
  { id: "t5", slug: "n8n", name: "n8n", category: "Automation", icon: "Workflow", connected: false, description: "Workflow automation engine" },
  { id: "t6", slug: "airtable", name: "Airtable", category: "Productivity", icon: "Table", connected: true, description: "Spreadsheet-database hybrid" },
  { id: "t7", slug: "tradingview", name: "TradingView", category: "Finance", icon: "TrendingUp", connected: false, description: "Market charts and alerts" },
  { id: "t8", slug: "whatsapp", name: "WhatsApp", category: "Messaging", icon: "MessageCircle", connected: true, description: "Business messaging" },
  { id: "t9", slug: "telegram", name: "Telegram", category: "Messaging", icon: "Send", connected: false, description: "Bot messaging gateway" },
  { id: "t10", slug: "instagram", name: "Instagram", category: "Social Media", icon: "Camera", connected: false, description: "Post and manage content" },
  { id: "t11", slug: "x", name: "X (Twitter)", category: "Social Media", icon: "AtSign", connected: true, description: "Post tweets and threads" },
  { id: "t12", slug: "facebook", name: "Facebook", category: "Social Media", icon: "Globe", connected: false, description: "Page and post management" },
];

// ========== WORKFLOWS ==========
export interface Workflow {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  triggerType: "daily" | "weekly" | "time" | "webhook";
  triggerConfig: string;
  actions: string[];
  status: "active" | "paused";
  nextRun: string;
}

export const mockWorkflows: Workflow[] = [
  {
    id: "w1",
    name: "Daily Content Digest",
    agentId: "a1",
    agentName: "Content Writer",
    triggerType: "daily",
    triggerConfig: "09:00 UTC",
    actions: ["Generate blog summary", "Post to X", "Log to Notion"],
    status: "active",
    nextRun: "Tomorrow 09:00",
  },
  {
    id: "w2",
    name: "Weekly Analytics Report",
    agentId: "a2",
    agentName: "Data Analyst",
    triggerType: "weekly",
    triggerConfig: "Monday 08:00 UTC",
    actions: ["Pull Airtable data", "Generate report", "Email to team"],
    status: "active",
    nextRun: "Monday 08:00",
  },
  {
    id: "w3",
    name: "Social Media Scheduler",
    agentId: "a3",
    agentName: "Social Media Manager",
    triggerType: "daily",
    triggerConfig: "12:00 UTC",
    actions: ["Generate post", "Post to Instagram", "Post to X"],
    status: "paused",
    nextRun: "—",
  },
  {
    id: "w4",
    name: "Trade Alert Handler",
    agentId: "a2",
    agentName: "Data Analyst",
    triggerType: "webhook",
    triggerConfig: "TradingView Alert",
    actions: ["Parse alert", "Log to Airtable", "Notify Telegram"],
    status: "active",
    nextRun: "On trigger",
  },
];

// ========== LLM MODELS ==========
export interface LLMModel {
  id: string;
  provider: string;
  name: string;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxTokens: number;
  capabilities: string[];
}

export const mockModels: LLMModel[] = [
  { id: "m1", provider: "OpenAI", name: "GPT-4o", costPer1kInput: 0.005, costPer1kOutput: 0.015, maxTokens: 128000, capabilities: ["text", "vision", "function-calling"] },
  { id: "m2", provider: "OpenAI", name: "GPT-4o Mini", costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxTokens: 128000, capabilities: ["text", "vision", "function-calling"] },
  { id: "m3", provider: "Anthropic", name: "Claude 3.5 Sonnet", costPer1kInput: 0.003, costPer1kOutput: 0.015, maxTokens: 200000, capabilities: ["text", "vision", "function-calling"] },
  { id: "m4", provider: "Anthropic", name: "Claude 3.5 Haiku", costPer1kInput: 0.0008, costPer1kOutput: 0.004, maxTokens: 200000, capabilities: ["text", "function-calling"] },
  { id: "m5", provider: "Google", name: "Gemini 2.5 Pro", costPer1kInput: 0.00125, costPer1kOutput: 0.005, maxTokens: 1000000, capabilities: ["text", "vision", "function-calling"] },
  { id: "m6", provider: "Google", name: "Gemini 2.5 Flash", costPer1kInput: 0.00015, costPer1kOutput: 0.0006, maxTokens: 1000000, capabilities: ["text", "vision", "function-calling"] },
];

// ========== USAGE / BILLING ==========
export interface DailyUsage {
  date: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export const mockDailyUsage: DailyUsage[] = [
  { date: "Feb 25", tokensIn: 45000, tokensOut: 12000, cost: 0.42 },
  { date: "Feb 26", tokensIn: 62000, tokensOut: 18000, cost: 0.58 },
  { date: "Feb 27", tokensIn: 38000, tokensOut: 9500, cost: 0.35 },
  { date: "Feb 28", tokensIn: 71000, tokensOut: 22000, cost: 0.68 },
  { date: "Mar 01", tokensIn: 55000, tokensOut: 15000, cost: 0.51 },
  { date: "Mar 02", tokensIn: 89000, tokensOut: 28000, cost: 0.85 },
  { date: "Mar 03", tokensIn: 43000, tokensOut: 11000, cost: 0.39 },
];

export const mockBudget = {
  monthlyLimit: 50,
  currentSpend: 18.42,
  hardStop: true,
  alertThresholds: [50, 80, 95],
};

// ========== ACTIVITY FEED ==========
export interface ActivityEvent {
  id: string;
  type: "execution" | "tool_call" | "error" | "approval";
  agentName: string;
  message: string;
  timestamp: string;
  cost?: number;
}

export const mockActivity: ActivityEvent[] = [
  { id: "e1", type: "execution", agentName: "Customer Support Bot", message: "Handled customer inquiry via WhatsApp", timestamp: "Just now", cost: 0.003 },
  { id: "e2", type: "tool_call", agentName: "Content Writer", message: "Posted thread to X (Twitter)", timestamp: "2 min ago", cost: 0.008 },
  { id: "e3", type: "execution", agentName: "Data Analyst", message: "Generated weekly analytics report", timestamp: "15 min ago", cost: 0.045 },
  { id: "e4", type: "error", agentName: "Social Media Manager", message: "Instagram API rate limit exceeded", timestamp: "1 hour ago" },
  { id: "e5", type: "approval", agentName: "Content Writer", message: "Awaiting approval: Send newsletter to 5,200 subscribers", timestamp: "2 hours ago" },
  { id: "e6", type: "tool_call", agentName: "Data Analyst", message: "Pulled 1,200 records from Airtable", timestamp: "3 hours ago", cost: 0.002 },
];

// ========== SECURITY ==========
export interface SecurityPolicy {
  securityLevel: "low" | "medium" | "high";
  spendingLimit: number;
  sensitiveDataProtection: boolean;
  manualApprovalMode: boolean;
  executionLogs: boolean;
}

export const mockSecurityPolicy: SecurityPolicy = {
  securityLevel: "medium",
  spendingLimit: 50,
  sensitiveDataProtection: true,
  manualApprovalMode: false,
  executionLogs: true,
};

export interface ExecutionLog {
  id: string;
  timestamp: string;
  agentName: string;
  action: string;
  toolUsed: string;
  status: "success" | "failed" | "blocked";
  tokensUsed: number;
  cost: number;
}

export const mockExecutionLogs: ExecutionLog[] = [
  { id: "l1", timestamp: "2025-03-03 14:32:01", agentName: "Customer Support Bot", action: "Reply to customer", toolUsed: "WhatsApp", status: "success", tokensUsed: 450, cost: 0.003 },
  { id: "l2", timestamp: "2025-03-03 14:28:15", agentName: "Content Writer", action: "Post thread", toolUsed: "X (Twitter)", status: "success", tokensUsed: 1200, cost: 0.008 },
  { id: "l3", timestamp: "2025-03-03 13:15:00", agentName: "Social Media Manager", action: "Post story", toolUsed: "Instagram", status: "failed", tokensUsed: 0, cost: 0 },
  { id: "l4", timestamp: "2025-03-03 12:00:00", agentName: "Data Analyst", action: "Pull data", toolUsed: "Airtable", status: "success", tokensUsed: 320, cost: 0.002 },
  { id: "l5", timestamp: "2025-03-03 09:00:00", agentName: "Content Writer", action: "Send newsletter", toolUsed: "Gmail", status: "blocked", tokensUsed: 0, cost: 0 },
];
