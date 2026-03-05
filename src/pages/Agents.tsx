import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Plus, Play, Pause, Loader2, Wrench, Check, Trash2, Pencil,
  MessageCircle, BarChart3, Workflow, Archive, Filter, MoreVertical,
  Send, Clock, TrendingUp, DollarSign, Shield, Timer, AlertTriangle,
  ExternalLink, Mail, Share2, Hash, FileText, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Zap, Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// ── Types ──
interface AgentRow {
  id: string; name: string; role_prompt: string | null;
  status: "active" | "paused" | "archived"; org_id: string;
  default_model_id: string | null; config_json: any;
  created_at: string; updated_at: string;
}
interface ModelRow { id: string; provider: string; model_name: string; display_name: string | null; }
interface McpToolRow { id: string; name: string; description: string | null; risk_level: string; server_id: string; }
interface McpServerRow { id: string; label: string; server_id: string; }
interface WorkflowRow { id: string; name: string; agent_id: string | null; is_active: boolean | null; trigger_type: string; }
interface RunStats { total: number; completed: number; failed: number; cost: number; lastRun: string | null; }
interface RunEventRow { id: string; type: string; created_at: string; payload_json: any; tokens_used: number | null; cost: number | null; duration_ms: number | null; }

type StatusFilter = "all" | "active" | "paused" | "archived";
type LogsFilter = "all" | "completed" | "failed" | "running";

// ── Templates ──
const AGENT_TEMPLATES = [
  { icon: "📧", name: "Email Assistant", prompt: "Tu es un assistant email professionnel. Tu gères la boîte Gmail de l'utilisateur avec tact et efficacité. Tu tries les emails par priorité, rédiges des réponses claires et concises, et signales les messages urgents.", tools: ["gmail_read_inbox", "gmail_send_email"], recommendedModel: "gemini-2.5-flash" },
  { icon: "📱", name: "Social Media Manager", prompt: "Tu es un community manager expert. Tu crées des posts engageants pour Instagram et Facebook, tu utilises des hashtags pertinents, et tu planifies les publications aux heures optimales.", tools: ["instagram_post", "facebook_post"], recommendedModel: "gemini-2.5-pro" },
  { icon: "💬", name: "Slack Reporter", prompt: "Tu es un reporter d'équipe Slack. Tu compiles les informations importantes, génères des rapports de synthèse, et envoies des alertes ciblées dans les bons canaux.", tools: ["slack_list_channels", "slack_send_message"], recommendedModel: "gemini-2.5-flash" },
  { icon: "📊", name: "Rapport Hebdomadaire", prompt: "Tu es un analyste de données. Tu compiles les métriques clés de la semaine (runs, coûts, performances), génères un rapport structuré avec des insights actionnables, et l'envoies par email ou Slack.", tools: [], recommendedModel: "gemini-2.5-pro" },
];

const SERVER_ICONS: Record<string, string> = { google: "🔵", slack: "🟢", social: "📱", messaging: "💬" };
function getServerIcon(label: string) {
  const lower = label.toLowerCase();
  for (const [key, icon] of Object.entries(SERVER_ICONS)) { if (lower.includes(key)) return icon; }
  return "🔧";
}

const PIE_COLORS = ["hsl(142, 71%, 45%)", "hsl(0, 84%, 60%)", "hsl(220, 10%, 46%)"];

export default function Agents() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolRow[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerRow[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { toast } = useToast();
  const navigate = useNavigate();

  const [toolCounts, setToolCounts] = useState<Record<string, number>>({});
  const [workflowCounts, setWorkflowCounts] = useState<Record<string, number>>({});
  const [runStats, setRunStats] = useState<Record<string, RunStats>>({});

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formModelId, setFormModelId] = useState("");
  const [formTimeout, setFormTimeout] = useState("60");
  const [formRequiresApproval, setFormRequiresApproval] = useState(false);
  const [assignedToolIds, setAssignedToolIds] = useState<Set<string>>(new Set());
  const [showTemplates, setShowTemplates] = useState(false);

  // Delete
  const [deleteAgent, setDeleteAgent] = useState<AgentRow | null>(null);
  const [deleteLinkedWorkflows, setDeleteLinkedWorkflows] = useState<WorkflowRow[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Logs drawer
  const [logsAgent, setLogsAgent] = useState<AgentRow | null>(null);
  const [logsRuns, setLogsRuns] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState<LogsFilter>("all");
  const [logsDailyData, setLogsDailyData] = useState<any[]>([]);
  const [logsPieData, setLogsPieData] = useState<any[]>([]);
  const [logsMetrics, setLogsMetrics] = useState({ total: 0, avgDuration: 0, totalCost: 0, topTool: "" });
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<RunEventRow[]>([]);

  // Chat test — full screen with Run Inspector
  const [chatAgent, setChatAgent] = useState<AgentRow | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatRunId, setChatRunId] = useState<string | null>(null);
  const [chatRunEvents, setChatRunEvents] = useState<RunEventRow[]>([]);
  const [chatRunStatus, setChatRunStatus] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, []);

  // Scroll chat to bottom
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages, chatSending]);

  // Realtime subscription for run_events during chat
  useEffect(() => {
    if (!chatRunId) return;
    const channel = supabase
      .channel(`run-events-${chatRunId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "run_events", filter: `run_id=eq.${chatRunId}` },
        (payload) => {
          const evt = payload.new as RunEventRow;
          setChatRunEvents(prev => [...prev, evt]);
        }
      )
      .subscribe();

    // Also subscribe to run status changes
    const runChannel = supabase
      .channel(`run-status-${chatRunId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "runs", filter: `id=eq.${chatRunId}` },
        (payload) => { setChatRunStatus((payload.new as any).status); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); supabase.removeChannel(runChannel); };
  }, [chatRunId]);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: membership } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
    if (!membership) { setLoading(false); return; }
    setOrgId(membership.org_id);
    const oid = membership.org_id;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [agentsRes, modelsRes, mcpToolsRes, mcpServersRes, agentToolsRes, workflowsRes, runsRes] = await Promise.all([
      supabase.from("agents").select("*").eq("org_id", oid).order("created_at", { ascending: false }),
      supabase.from("models").select("id, provider, model_name, display_name").eq("is_active", true),
      supabase.from("mcp_tools").select("id, name, description, risk_level, server_id").eq("org_id", oid),
      supabase.from("mcp_servers").select("id, label, server_id").eq("org_id", oid),
      supabase.from("agent_tools").select("agent_id, mcp_tool_id"),
      supabase.from("workflows").select("id, name, agent_id, is_active, trigger_type").eq("org_id", oid),
      supabase.from("runs").select("id, agent_id, status, total_cost, created_at").eq("org_id", oid).gte("created_at", monthStart).order("created_at", { ascending: false }),
    ]);

    if (agentsRes.data) setAgents(agentsRes.data as AgentRow[]);
    if (modelsRes.data) setModels(modelsRes.data as ModelRow[]);
    if (mcpToolsRes.data) setMcpTools(mcpToolsRes.data as McpToolRow[]);
    if (mcpServersRes.data) setMcpServers(mcpServersRes.data as McpServerRow[]);
    if (workflowsRes.data) setWorkflows(workflowsRes.data as WorkflowRow[]);

    const tc: Record<string, number> = {};
    for (const at of agentToolsRes.data ?? []) tc[at.agent_id] = (tc[at.agent_id] || 0) + 1;
    setToolCounts(tc);
    const wc: Record<string, number> = {};
    for (const w of workflowsRes.data ?? []) if (w.agent_id) wc[w.agent_id] = (wc[w.agent_id] || 0) + 1;
    setWorkflowCounts(wc);
    const rs: Record<string, RunStats> = {};
    for (const r of runsRes.data ?? []) {
      if (!r.agent_id) continue;
      if (!rs[r.agent_id]) rs[r.agent_id] = { total: 0, completed: 0, failed: 0, cost: 0, lastRun: null };
      const s = rs[r.agent_id]; s.total++;
      if (r.status === "completed") s.completed++;
      if (r.status === "failed") s.failed++;
      s.cost += Number(r.total_cost) || 0;
      if (!s.lastRun) s.lastRun = r.created_at;
    }
    setRunStats(rs);
    setLoading(false);
  };

  // ── Drawer (Create/Edit) ──
  const openDrawer = async (agent?: AgentRow) => {
    if (agent) {
      setEditingAgent(agent); setFormName(agent.name); setFormPrompt(agent.role_prompt || "");
      setFormModelId(agent.default_model_id || ""); setFormTimeout(agent.config_json?.timeout?.toString() || "60");
      setFormRequiresApproval(agent.config_json?.requires_approval || false); setShowTemplates(false);
      const { data } = await supabase.from("agent_tools").select("mcp_tool_id").eq("agent_id", agent.id).not("mcp_tool_id", "is", null);
      setAssignedToolIds(new Set((data ?? []).map((r: any) => r.mcp_tool_id).filter(Boolean)));
    } else {
      setEditingAgent(null); setFormName(""); setFormPrompt(""); setFormModelId("");
      setFormTimeout("60"); setFormRequiresApproval(false); setAssignedToolIds(new Set()); setShowTemplates(true);
    }
    setDrawerOpen(true);
  };

  const applyTemplate = (tpl: typeof AGENT_TEMPLATES[0]) => {
    setFormName(tpl.name); setFormPrompt(tpl.prompt);
    // Auto-select recommended model
    const matchedModel = models.find(m => m.model_name.includes(tpl.recommendedModel) || m.display_name?.includes(tpl.recommendedModel));
    if (matchedModel) setFormModelId(matchedModel.id);
    const toolIds = new Set<string>();
    for (const toolName of tpl.tools) {
      const found = mcpTools.find(t => t.name === toolName);
      if (found) toolIds.add(found.id);
    }
    setAssignedToolIds(toolIds); setShowTemplates(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !orgId) { toast({ title: "Nom requis", variant: "destructive" }); return; }
    setSaving(true);
    const configJson = { timeout: parseInt(formTimeout), requires_approval: formRequiresApproval };
    if (editingAgent) {
      const { error } = await supabase.from("agents").update({ name: formName.trim(), role_prompt: formPrompt.trim() || null, default_model_id: formModelId || null, config_json: configJson }).eq("id", editingAgent.id);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); }
      else {
        await saveToolAssignments(editingAgent.id);
        setAgents(prev => prev.map(a => a.id === editingAgent.id ? { ...a, name: formName.trim(), role_prompt: formPrompt.trim() || null, default_model_id: formModelId || null, config_json: configJson } : a));
        setDrawerOpen(false); toast({ title: "Agent mis à jour ✅" });
      }
    } else {
      const { data, error } = await supabase.from("agents").insert({ org_id: orgId, name: formName.trim(), role_prompt: formPrompt.trim() || null, default_model_id: formModelId || null, status: "active" as const, config_json: configJson }).select().single();
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); }
      else if (data) { await saveToolAssignments(data.id); setAgents(prev => [data as AgentRow, ...prev]); setDrawerOpen(false); toast({ title: "Agent créé ✅" }); }
    }
    setSaving(false);
  };

  const saveToolAssignments = async (agentId: string) => {
    await supabase.from("agent_tools").delete().eq("agent_id", agentId);
    if (assignedToolIds.size > 0) {
      await supabase.from("agent_tools").insert(Array.from(assignedToolIds).map(mcpToolId => ({ agent_id: agentId, mcp_tool_id: mcpToolId })) as any);
    }
    setToolCounts(prev => ({ ...prev, [agentId]: assignedToolIds.size }));
  };

  const toggleStatus = async (agent: AgentRow) => {
    const newStatus = agent.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("agents").update({ status: newStatus }).eq("id", agent.id);
    if (!error) setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: newStatus } : a));
  };

  const setAgentStatus = async (id: string, status: "active" | "paused" | "archived") => {
    const { error } = await supabase.from("agents").update({ status }).eq("id", id);
    if (!error) setAgents(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  // ── Smart Delete ──
  const initiateDelete = (agent: AgentRow) => {
    const linked = workflows.filter(w => w.agent_id === agent.id && w.is_active);
    setDeleteLinkedWorkflows(linked);
    setDeleteAgent(agent);
  };

  const confirmDelete = async () => {
    if (!deleteAgent) return;
    setDeleting(true);
    // 1. Pause linked active workflows
    if (deleteLinkedWorkflows.length > 0) {
      for (const w of deleteLinkedWorkflows) {
        await supabase.from("workflows").update({ is_active: false }).eq("id", w.id);
      }
    }
    // 2. Delete agent_tools
    await supabase.from("agent_tools").delete().eq("agent_id", deleteAgent.id);
    // 3. Soft delete → archive
    const { error } = await supabase.from("agents").update({ status: "archived" as const }).eq("id", deleteAgent.id);
    if (!error) {
      setAgents(prev => prev.map(a => a.id === deleteAgent.id ? { ...a, status: "archived" as const } : a));
      setWorkflows(prev => prev.map(w => deleteLinkedWorkflows.some(lw => lw.id === w.id) ? { ...w, is_active: false } : w));
      toast({ title: `Agent "${deleteAgent.name}" archivé` });
    } else {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
    setDeleting(false); setDeleteAgent(null);
  };

  // ── Logs Drawer ──
  const openLogs = async (agent: AgentRow) => {
    setLogsAgent(agent); setLogsLoading(true); setLogsFilter("all"); setExpandedRunId(null);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [runsRes, eventsRes] = await Promise.all([
      supabase.from("runs").select("id, status, source, created_at, finished_at, started_at, total_tokens, total_cost, error_message")
        .eq("agent_id", agent.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("run_events").select("type, cost, tokens_used, duration_ms, run_id")
        .in("run_id", (await supabase.from("runs").select("id").eq("agent_id", agent.id).gte("created_at", thirtyDaysAgo).limit(200)).data?.map(r => r.id) || []),
    ]);

    const runs = runsRes.data ?? [];
    setLogsRuns(runs);

    // Daily chart data (30 days)
    const dailyMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dailyMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of runs) {
      const day = r.created_at.slice(0, 10);
      if (dailyMap[day] !== undefined) dailyMap[day]++;
    }
    setLogsDailyData(Object.entries(dailyMap).map(([date, count]) => ({ date: date.slice(5), runs: count })));

    // Pie data
    const completed = runs.filter(r => r.status === "completed").length;
    const failed = runs.filter(r => r.status === "failed").length;
    const other = runs.length - completed - failed;
    setLogsPieData([
      { name: "Succès", value: completed },
      { name: "Échec", value: failed },
      { name: "Autre", value: other },
    ].filter(d => d.value > 0));

    // Metrics
    const durations = runs.filter(r => r.started_at && r.finished_at).map(r => new Date(r.finished_at).getTime() - new Date(r.started_at).getTime());
    const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : 0;
    const totalCost = runs.reduce((s, r) => s + (Number(r.total_cost) || 0), 0);

    // Top tool
    const toolCount: Record<string, number> = {};
    for (const e of eventsRes.data ?? []) {
      if (e.type === "tool_call") {
        const name = (e as any).payload_json?.tool_name || "unknown";
        toolCount[name] = (toolCount[name] || 0) + 1;
      }
    }
    const topTool = Object.entries(toolCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    setLogsMetrics({ total: runs.length, avgDuration, totalCost, topTool });
    setLogsLoading(false);
  };

  const expandRun = async (runId: string) => {
    if (expandedRunId === runId) { setExpandedRunId(null); return; }
    setExpandedRunId(runId);
    const { data } = await supabase.from("run_events").select("*").eq("run_id", runId).order("created_at", { ascending: true });
    setExpandedEvents((data ?? []) as RunEventRow[]);
  };

  // ── Chat with Run Inspector ──
  const openChat = (agent: AgentRow) => {
    setChatAgent(agent); setChatMessages([]); setChatInput("");
    setChatRunId(null); setChatRunEvents([]); setChatRunStatus(null);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatAgent || !orgId) return;
    const userMsg = chatInput.trim();
    setChatInput(""); setChatRunEvents([]); setChatRunStatus("running"); setChatRunId(null);
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatSending(true);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ org_id: orgId, agent_id: chatAgent.id, prompt: userMsg }),
      });

      const text = await resp.text();
      let assistantMsg = "";
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "token" && evt.content) assistantMsg += evt.content;
          if (evt.type === "final" && evt.content) assistantMsg = evt.content;
          if (evt.run_id && !chatRunId) setChatRunId(evt.run_id);
          if (evt.status) setChatRunStatus(evt.status);
        } catch {}
      }
      setChatMessages(prev => [...prev, { role: "assistant", content: assistantMsg || "(pas de réponse)" }]);
      setChatRunStatus("completed");
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "❌ Erreur de connexion" }]);
      setChatRunStatus("failed");
    }
    setChatSending(false);
  };

  // ── Helpers ──
  const getModelName = (modelId: string | null) => {
    if (!modelId) return "Aucun modèle";
    const m = models.find(m => m.id === modelId);
    return m ? (m.display_name || m.model_name) : "Inconnu";
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return `il y a ${Math.floor(hrs / 24)}j`;
  };

  const getSuccessRate = (stats: RunStats | undefined) => {
    if (!stats || stats.total === 0) return null;
    return Math.round((stats.completed / stats.total) * 100);
  };

  const toolsByServer = () => {
    const groups: { server: McpServerRow; tools: McpToolRow[] }[] = [];
    for (const server of mcpServers) {
      const st = mcpTools.filter(t => t.server_id === server.id);
      if (st.length > 0) groups.push({ server, tools: st });
    }
    const serverIds = new Set(mcpServers.map(s => s.id));
    const orphans = mcpTools.filter(t => !serverIds.has(t.server_id));
    if (orphans.length > 0) groups.push({ server: { id: "__orphan", label: "Autres outils", server_id: "other" }, tools: orphans });
    return groups;
  };

  const hasHighRiskSelected = Array.from(assignedToolIds).some(id => mcpTools.find(t => t.id === id)?.risk_level === "high");
  const filtered = agents.filter(a => statusFilter === "all" || a.status === statusFilter);
  const agentWorkflows = (agentId: string) => workflows.filter(w => w.agent_id === agentId);
  const triggerLabel = (t: string) => ({ cron: "⏰ Cron", webhook: "🔗 Webhook", event: "⚡ Event" }[t] || "▶️ Manuel");

  const eventIcon = (type: string) => {
    switch (type) {
      case "tool_call": return <Wrench className="h-3 w-3" />;
      case "llm_call": return <Bot className="h-3 w-3" />;
      case "policy_check": return <Shield className="h-3 w-3" />;
      case "error": return <XCircle className="h-3 w-3 text-destructive" />;
      case "approval_required": return <AlertTriangle className="h-3 w-3 text-yellow-500" />;
      case "approval_granted": return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      default: return <Activity className="h-3 w-3" />;
    }
  };

  const eventBadgeClass = (type: string) => {
    if (type === "error") return "border-destructive/30 text-destructive";
    if (type === "tool_call") return "border-primary/30 text-primary";
    if (type === "llm_call") return "border-purple-500/30 text-purple-500";
    return "border-muted-foreground/30 text-muted-foreground";
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Agents</h1>
            <p className="text-sm text-muted-foreground">{agents.length} agent{agents.length !== 1 ? "s" : ""} configuré{agents.length !== 1 ? "s" : ""}</p>
          </div>
          <Button className="gradient-blue gap-2" onClick={() => openDrawer()}><Plus className="h-4 w-4" /> Nouvel agent</Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "active", "paused", "archived"] as StatusFilter[]).map(f => (
            <Button key={f} variant={statusFilter === f ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setStatusFilter(f)}>
              {f === "all" ? "Tous" : f === "active" ? "Actifs" : f === "paused" ? "En pause" : "Archivés"}
              {f !== "all" && <Badge variant="secondary" className="ml-1.5 h-4 min-w-[16px] px-1 text-[10px]">{agents.filter(a => a.status === f).length}</Badge>}
            </Button>
          ))}
        </div>

        {/* Global Stats Banner */}
        {agents.length > 0 && (() => {
          const allStats = Object.values(runStats);
          const globalRuns = allStats.reduce((s, r) => s + r.total, 0);
          const globalCompleted = allStats.reduce((s, r) => s + r.completed, 0);
          const globalFailed = allStats.reduce((s, r) => s + r.failed, 0);
          const globalCost = allStats.reduce((s, r) => s + r.cost, 0);
          const globalSuccessRate = globalRuns > 0 ? Math.round((globalCompleted / globalRuns) * 100) : 0;
          const activeCount = agents.filter(a => a.status === "active").length;
          return (
            <div className="grid grid-cols-5 gap-3 px-6 py-3 border-b border-border bg-muted/30">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{activeCount}<span className="text-muted-foreground font-normal text-sm">/{agents.length}</span></p>
                <p className="text-[10px] text-muted-foreground">Agents actifs</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{globalRuns}</p>
                <p className="text-[10px] text-muted-foreground">Runs ce mois</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-bold ${globalSuccessRate >= 90 ? "text-green-600" : globalSuccessRate >= 70 ? "text-yellow-600" : "text-destructive"}`}>{globalSuccessRate}%</p>
                <p className="text-[10px] text-muted-foreground">Taux de succès</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-destructive">{globalFailed}</p>
                <p className="text-[10px] text-muted-foreground">Échecs</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">${globalCost.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">Coût total</p>
              </div>
            </div>
          );
        })()}

        {/* Agent list */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4 max-w-4xl mx-auto">
            {filtered.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Bot className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-display font-semibold text-lg text-foreground">Aucun agent</h3>
                  <p className="text-sm text-muted-foreground mt-1">Créez votre premier agent IA pour commencer.</p>
                </CardContent>
              </Card>
            ) : filtered.map(agent => {
              const stats = runStats[agent.id];
              const successRate = getSuccessRate(stats);
              return (
                <Card key={agent.id} className="transition-all hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Bot className="h-5 w-5 text-primary" /></div>
                        <div>
                          <h3 className="font-display font-semibold text-foreground">{agent.name}</h3>
                          <p className="text-xs text-muted-foreground">{getModelName(agent.default_model_id)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tooltip><TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${agent.status === "active" ? "bg-green-500" : agent.status === "paused" ? "bg-yellow-500" : "bg-muted-foreground"}`} />
                            <Switch checked={agent.status === "active"} onCheckedChange={() => toggleStatus(agent)} disabled={agent.status === "archived"} className="scale-75" />
                          </div>
                        </TooltipTrigger><TooltipContent>{agent.status === "active" ? "Actif" : "En pause"}</TooltipContent></Tooltip>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {agent.status !== "archived" && <DropdownMenuItem onClick={() => setAgentStatus(agent.id, "archived")}><Archive className="mr-2 h-4 w-4" /> Archiver</DropdownMenuItem>}
                            {agent.status === "archived" && <DropdownMenuItem onClick={() => setAgentStatus(agent.id, "active")}><Play className="mr-2 h-4 w-4" /> Réactiver</DropdownMenuItem>}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => initiateDelete(agent)}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {agent.role_prompt && <p className="mt-2 text-xs text-muted-foreground italic truncate">"{agent.role_prompt.slice(0, 80)}{agent.role_prompt.length > 80 ? "…" : ""}"</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5"><Wrench className="h-3 w-3" /> {toolCounts[agent.id] || 0} outils</span>
                      <button className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer" onClick={() => navigate("/workflows")}><Workflow className="h-3 w-3" /> {workflowCounts[agent.id] || 0} workflows</button>
                      {stats?.lastRun && <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5"><Clock className="h-3 w-3" /> {timeAgo(stats.lastRun)}</span>}
                      <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5"><BarChart3 className="h-3 w-3" /> {stats?.total || 0} runs</span>
                      {successRate !== null && <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 ${successRate >= 90 ? "bg-green-500/10 text-green-600" : successRate >= 70 ? "bg-yellow-500/10 text-yellow-600" : "bg-destructive/10 text-destructive"}`}><TrendingUp className="h-3 w-3" /> {successRate}%</span>}
                      {stats && stats.cost > 0 && <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5"><DollarSign className="h-3 w-3" /> ${stats.cost.toFixed(2)}</span>}
                    </div>
                    <Separator className="my-3" />
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => openChat(agent)}><MessageCircle className="h-3 w-3" /> Tester</Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => openDrawer(agent)}><Pencil className="h-3 w-3" /> Éditer</Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => openLogs(agent)}><BarChart3 className="h-3 w-3" /> Logs</Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => initiateDelete(agent)}><Trash2 className="h-3 w-3" /> Supprimer</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        {/* ═══ Edit / Create Drawer with Templates ═══ */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader className="pb-4">
              <SheetTitle className="font-display">{editingAgent ? `Éditer — ${editingAgent.name}` : "Nouvel agent"}</SheetTitle>
              <SheetDescription>{editingAgent ? "Configuration, outils et workflows." : "Choisissez un template ou partez de zéro."}</SheetDescription>
            </SheetHeader>

            {/* Templates (only on create) */}
            {!editingAgent && showTemplates && (
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-3">Templates</p>
                <div className="grid grid-cols-2 gap-2">
                  {AGENT_TEMPLATES.map(tpl => (
                    <button key={tpl.name} onClick={() => applyTemplate(tpl)}
                      className="flex flex-col items-start rounded-lg border border-border p-3 text-left hover:bg-muted/50 hover:border-primary/30 transition-all">
                      <span className="text-2xl mb-1">{tpl.icon}</span>
                      <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                      <span className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{tpl.prompt.slice(0, 60)}…</span>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setShowTemplates(false)}>
                  Ou créer de zéro →
                </Button>
              </div>
            )}

            {(!showTemplates || editingAgent) && (
              <Tabs defaultValue="config" className="mt-2">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="config">⚙️ Config</TabsTrigger>
                  <TabsTrigger value="tools">🔧 Outils</TabsTrigger>
                  <TabsTrigger value="workflows">🔗 Workflows</TabsTrigger>
                </TabsList>

                <TabsContent value="config" className="space-y-4 mt-4">
                  <div className="space-y-2"><Label>Nom de l'agent</Label><Input placeholder="ex. Content Writer" value={formName} onChange={e => setFormName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Role prompt</Label><Textarea placeholder="Décris le rôle, le ton, les capacités et les limites de cet agent..." rows={6} value={formPrompt} onChange={e => setFormPrompt(e.target.value)} /><p className="text-[11px] text-muted-foreground">Décris le rôle, le ton, les capacités et les limites de cet agent.</p></div>
                  <div className="space-y-2"><Label>Modèle LLM</Label><Select value={formModelId} onValueChange={setFormModelId}><SelectTrigger><SelectValue placeholder="Sélectionner un modèle" /></SelectTrigger><SelectContent>{models.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name || m.model_name} ({m.provider})</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Timeout</Label><Select value={formTimeout} onValueChange={setFormTimeout}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 secondes</SelectItem><SelectItem value="60">60 secondes</SelectItem><SelectItem value="120">120 secondes</SelectItem></SelectContent></Select></div>
                  <div className="flex items-center justify-between rounded-md border border-border p-3"><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium text-foreground">Approbation requise</p><p className="text-[11px] text-muted-foreground">Chaque run nécessite une validation</p></div></div><Switch checked={formRequiresApproval} onCheckedChange={setFormRequiresApproval} /></div>
                </TabsContent>

                <TabsContent value="tools" className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">Outils MCP disponibles pour cet agent.</p>
                  {hasHighRiskSelected && <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4" /><AlertDescription className="text-xs">⚠️ Outils <strong>high risk</strong> sélectionnés. Ces outils peuvent envoyer des messages ou publier du contenu au nom de votre organisation.</AlertDescription></Alert>}
                  {mcpTools.length === 0 ? (
                    <div className="text-center py-8"><Wrench className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Aucun outil MCP disponible.</p></div>
                  ) : (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{assignedToolIds.size}/{mcpTools.length}</span><Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setAssignedToolIds(assignedToolIds.size === mcpTools.length ? new Set() : new Set(mcpTools.map(t => t.id)))}>{assignedToolIds.size === mcpTools.length ? "Tout désélectionner" : "Tout sélectionner"}</Button></div>
                      {toolsByServer().map(({ server, tools }) => (
                        <div key={server.id}>
                          <div className="flex items-center gap-2 mb-2"><span className="text-base">{getServerIcon(server.label)}</span><h4 className="text-sm font-semibold text-foreground">{server.label}</h4><Badge variant="secondary" className="text-[10px] h-4 px-1">{tools.length}</Badge></div>
                          <div className="space-y-1.5 ml-6">
                            {tools.map(tool => {
                              const isHigh = tool.risk_level === "high";
                              return (
                                <label key={tool.id} className={`flex items-center gap-3 rounded-md border p-2.5 cursor-pointer transition-colors ${assignedToolIds.has(tool.id) ? isHigh ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                                  <Checkbox checked={assignedToolIds.has(tool.id)} onCheckedChange={() => setAssignedToolIds(prev => { const n = new Set(prev); n.has(tool.id) ? n.delete(tool.id) : n.add(tool.id); return n; })} />
                                  <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="text-sm font-medium text-foreground">{tool.name}</p>{isHigh && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}</div>{tool.description && <p className="text-[11px] text-muted-foreground line-clamp-1">{tool.description}</p>}</div>
                                  <Badge variant="outline" className={`text-[10px] shrink-0 ${isHigh ? "border-destructive/30 text-destructive" : tool.risk_level === "medium" ? "border-yellow-500/30 text-yellow-600" : "border-green-500/30 text-green-600"}`}>{tool.risk_level}</Badge>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="workflows" className="mt-4">
                  <p className="text-sm text-muted-foreground mb-3">Workflows utilisant cet agent.</p>
                  {!editingAgent ? <p className="text-sm text-muted-foreground text-center py-8">Créez d'abord l'agent.</p> : (() => {
                    const linked = agentWorkflows(editingAgent.id);
                    return (
                      <div className="space-y-3">
                        {linked.length === 0 && <div className="text-center py-8"><Workflow className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Aucun workflow lié.</p></div>}
                        {linked.map(w => (
                          <div key={w.id} className="flex items-center justify-between rounded-md border border-border p-3">
                            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary shrink-0" /><span className="text-sm font-medium text-foreground truncate">{w.name}</span></div><div className="flex items-center gap-2 mt-1 ml-6"><Badge variant="secondary" className="text-[10px] h-4 px-1.5">{triggerLabel(w.trigger_type)}</Badge><Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${w.is_active ? "border-green-500/30 text-green-600" : "border-muted-foreground/30 text-muted-foreground"}`}>{w.is_active ? "Actif" : "Inactif"}</Badge></div></div>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setDrawerOpen(false); navigate("/workflows"); }}><ExternalLink className="h-3 w-3" /> Voir</Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" className="w-full gap-1.5 mt-2" onClick={() => { setDrawerOpen(false); navigate(`/workflows?agent_id=${editingAgent.id}`); }}><Plus className="h-3.5 w-3.5" /> Créer un workflow avec cet agent</Button>
                      </div>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            )}

            <div className="mt-6 pt-4 border-t border-border">
              <Button className="w-full gradient-blue" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingAgent ? "Enregistrer les modifications" : "Créer l'agent"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* ═══ Smart Delete Dialog ═══ */}
        <AlertDialog open={!!deleteAgent} onOpenChange={open => !open && setDeleteAgent(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer "{deleteAgent?.name}" ?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                {deleteLinkedWorkflows.length > 0 && (
                  <Alert className="mt-2"><AlertTriangle className="h-4 w-4" /><AlertDescription className="text-xs">
                    Cet agent est utilisé dans <strong>{deleteLinkedWorkflows.length} workflow{deleteLinkedWorkflows.length > 1 ? "s" : ""} actif{deleteLinkedWorkflows.length > 1 ? "s" : ""}</strong>. Ces workflows seront mis en pause.
                  </AlertDescription></Alert>
                )}
                <p className="text-sm">L'agent sera archivé (soft delete). L'historique des runs sera conservé. Cette action est irréversible.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Supprimer quand même
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ═══ Logs Drawer ═══ */}
        <Sheet open={!!logsAgent} onOpenChange={open => !open && setLogsAgent(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader className="pb-4">
              <SheetTitle className="font-display flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Logs — {logsAgent?.name}</SheetTitle>
            </SheetHeader>

            {logsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-6">
                {/* Stats visuelles */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">📈 30 derniers jours</h4>
                  <div className="grid grid-cols-2 gap-6">
                    {/* Line chart */}
                    <div className="h-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={logsDailyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <RTooltip contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                          <Line type="monotone" dataKey="runs" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Pie chart */}
                    <div className="h-[140px] flex items-center justify-center">
                      {logsPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={logsPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                              {logsPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <RTooltip contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : <p className="text-xs text-muted-foreground">Aucun run</p>}
                    </div>
                  </div>

                  {/* Metrics row */}
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    <div className="rounded-md border border-border p-2.5 text-center"><p className="text-lg font-bold text-foreground">{logsMetrics.total}</p><p className="text-[10px] text-muted-foreground">Total runs</p></div>
                    <div className="rounded-md border border-border p-2.5 text-center"><p className="text-lg font-bold text-foreground">{logsMetrics.avgDuration}s</p><p className="text-[10px] text-muted-foreground">Temps moyen</p></div>
                    <div className="rounded-md border border-border p-2.5 text-center"><p className="text-lg font-bold text-foreground">${logsMetrics.totalCost.toFixed(2)}</p><p className="text-[10px] text-muted-foreground">Coût total</p></div>
                    <div className="rounded-md border border-border p-2.5 text-center"><p className="text-xs font-bold text-foreground truncate">{logsMetrics.topTool}</p><p className="text-[10px] text-muted-foreground">Top outil</p></div>
                  </div>
                </div>

                <Separator />

                {/* Runs list */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-foreground">Runs récents</h4>
                    <div className="flex gap-1">
                      {(["all", "completed", "failed", "running"] as LogsFilter[]).map(f => (
                        <Button key={f} variant={logsFilter === f ? "default" : "ghost"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setLogsFilter(f)}>
                          {f === "all" ? "Tous" : f === "completed" ? "Succès" : f === "failed" ? "Échec" : "En cours"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {logsRuns.filter(r => logsFilter === "all" || r.status === logsFilter).map((run: any) => {
                      const duration = run.started_at && run.finished_at
                        ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                        : null;
                      return (
                        <div key={run.id}>
                          <button onClick={() => expandRun(run.id)} className="w-full flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/30 transition-colors text-left">
                            <div className="flex items-center gap-3">
                              {expandedRunId === run.id ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                              <Badge variant="outline" className={
                                run.status === "completed" ? "border-green-500/30 text-green-600" :
                                run.status === "failed" ? "border-destructive/30 text-destructive" :
                                run.status === "running" ? "border-blue-500/30 text-blue-500" :
                                "border-muted-foreground/30 text-muted-foreground"
                              }>{run.status}</Badge>
                              <div>
                                <p className="text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString("fr-FR")}</p>
                                <p className="text-[10px] text-muted-foreground">{run.source}{duration !== null ? ` · ${duration}s` : ""}</p>
                              </div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              {run.total_tokens ? <span>{run.total_tokens} tok</span> : null}
                              {run.total_cost ? <span className="ml-2">${Number(run.total_cost).toFixed(4)}</span> : null}
                            </div>
                          </button>
                          {/* Expanded run events */}
                          {expandedRunId === run.id && (
                            <div className="ml-6 mt-1 mb-2 border-l-2 border-border pl-3 space-y-1.5">
                              {expandedEvents.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">Aucun événement</p>
                              ) : expandedEvents.map(evt => (
                                <div key={evt.id} className="flex items-center gap-2 text-xs">
                                  {eventIcon(evt.type)}
                                  <Badge variant="outline" className={`text-[9px] px-1.5 h-4 ${eventBadgeClass(evt.type)}`}>{evt.type}</Badge>
                                  <span className="text-muted-foreground">{new Date(evt.created_at).toLocaleTimeString("fr-FR")}</span>
                                  {evt.duration_ms && <span className="text-muted-foreground">{evt.duration_ms}ms</span>}
                                  {evt.tokens_used ? <span className="text-muted-foreground">{evt.tokens_used} tok</span> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {logsRuns.filter(r => logsFilter === "all" || r.status === logsFilter).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">Aucun run trouvé.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* ═══ Full-screen Chat with Run Inspector ═══ */}
        <Dialog open={!!chatAgent} onOpenChange={open => !open && setChatAgent(null)}>
          <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Bot className="h-5 w-5 text-primary" /></div>
                <div>
                  <h3 className="font-display font-semibold text-sm text-foreground">{chatAgent?.name}</h3>
                  <p className="text-[11px] text-muted-foreground">{chatAgent ? getModelName(chatAgent.default_model_id) : ""} · Chat de test</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{toolCounts[chatAgent?.id || ""] || 0} outils</Badge>
                {chatRunStatus && (
                  <Badge variant="outline" className={`text-[10px] ${chatRunStatus === "completed" ? "border-green-500/30 text-green-600" : chatRunStatus === "failed" ? "border-destructive/30 text-destructive" : "border-blue-500/30 text-blue-500"}`}>
                    {chatRunStatus}
                  </Badge>
                )}
              </div>
            </div>

            {/* Body: Chat + Inspector */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left: Chat */}
              <div className="flex-1 flex flex-col border-r border-border">
                <ScrollArea className="flex-1 px-5 py-4">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-16">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4"><MessageCircle className="h-8 w-8 text-primary" /></div>
                      <h3 className="font-display font-semibold text-foreground mb-1">Testez votre agent</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">Envoyez un message pour vérifier la réponse, les outils et le prompt.</p>
                      {chatAgent?.role_prompt && <div className="mt-4 max-w-md rounded-lg bg-muted p-3"><p className="text-[11px] text-muted-foreground italic">"{chatAgent.role_prompt.slice(0, 120)}{chatAgent.role_prompt.length > 120 ? "…" : ""}"</p></div>}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {chatMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"}`}>{msg.content}</div>
                        </div>
                      ))}
                      {chatSending && (
                        <div className="flex justify-start"><div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5"><div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" /><span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" /><span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" /></div></div></div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </ScrollArea>
                <div className="px-5 py-3 border-t border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <Input placeholder="Écrivez un message..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()} disabled={chatSending} className="flex-1" />
                    <Button size="icon" onClick={sendChatMessage} disabled={chatSending || !chatInput.trim()}><Send className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>

              {/* Right: Run Inspector */}
              <div className="w-[280px] flex flex-col shrink-0">
                <div className="px-3 py-2 border-b border-border">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Activity className="h-3 w-3" /> Run Inspector</h4>
                </div>
                <ScrollArea className="flex-1 px-3 py-2">
                  {chatRunEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Les événements apparaîtront ici en temps réel.</p>
                  ) : (
                    <div className="space-y-2">
                      {chatRunEvents.map((evt, i) => (
                        <div key={evt.id || i} className="flex items-start gap-2 text-xs">
                          <div className="mt-0.5 shrink-0">{eventIcon(evt.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`text-[9px] px-1 h-4 ${eventBadgeClass(evt.type)}`}>{evt.type.replace("_", " ")}</Badge>
                              {evt.type === "tool_call" && (
                                <Badge variant="outline" className={`text-[9px] px-1 h-4 ${evt.payload_json?.success === false ? "border-destructive/30 text-destructive" : "border-green-500/30 text-green-600"}`}>
                                  {evt.payload_json?.success === false ? "✗" : "✓"}
                                </Badge>
                              )}
                            </div>
                            {evt.payload_json?.tool_name && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{evt.payload_json.tool_name}</p>}
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                              {evt.duration_ms && <span>{evt.duration_ms}ms</span>}
                              {evt.tokens_used ? <span>{evt.tokens_used} tok</span> : null}
                              {evt.cost ? <span>${Number(evt.cost).toFixed(4)}</span> : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {chatRunId && (
                  <div className="px-3 py-2 border-t border-border">
                    <Button variant="ghost" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => { setChatAgent(null); if (chatAgent) openLogs(chatAgent); }}>
                      <BarChart3 className="h-3 w-3" /> Voir dans les logs complets
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
