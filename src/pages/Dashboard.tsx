import { useEffect, useState, useCallback } from "react";
import {
  Zap, DollarSign, Bot, Plug, Calendar, ArrowRight,
  CheckCircle, XCircle, Clock, Loader2, X, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { GoogleOAuthBanner } from "@/components/GoogleOAuthBanner";

const statusIcon: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-3.5 w-3.5 text-success" />,
  running: <Zap className="h-3.5 w-3.5 text-primary animate-pulse" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  pending: <Clock className="h-3.5 w-3.5 text-warning" />,
  cancelled: <X className="h-3.5 w-3.5 text-muted-foreground" />,
};

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  failed: "destructive",
  pending: "outline",
  cancelled: "outline",
};

const eventTypeLabel: Record<string, string> = {
  policy_check: "🛡️ Policy Check",
  llm_call: "🤖 LLM Call",
  tool_call: "🔧 Tool Call",
  log: "📝 Log",
  error: "❌ Error",
  approval_required: "⏳ Approval Required",
  approval_granted: "✅ Approval Granted",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [toolCount, setToolCount] = useState(0);
  const [workflowCount, setWorkflowCount] = useState(0);
  const [budget, setBudget] = useState({ monthly_limit: 50, current: 0, hard_stop: true });
  const [dailyUsage, setDailyUsage] = useState<{ date: string; cost: number }[]>([]);
  const [recentRuns, setRecentRuns] = useState<any[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [todayUsage, setTodayUsage] = useState({ tokens: 0, cost: 0 });

  // Run inspector
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
      if (!membership) { setLoading(false); return; }
      const oid = membership.org_id;
      setOrgId(oid);

      const [
        { count: ac },
        { count: tc },
        { count: wc },
        { data: budgetData },
        { data: usage },
        { data: runs },
      ] = await Promise.all([
        supabase.from("agents").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("status", "active"),
        supabase.from("tool_connections").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("status", "connected"),
        supabase.from("workflows").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("is_active", true),
        supabase.from("budgets").select("*").eq("org_id", oid).single(),
        supabase.from("usage_daily").select("*").eq("org_id", oid).order("date", { ascending: true }).limit(30),
        supabase.from("runs").select("*, agents(name)").eq("org_id", oid).order("created_at", { ascending: false }).limit(10),
      ]);

      setAgentCount(ac || 0);
      setToolCount(tc || 0);
      setWorkflowCount(wc || 0);

      if (budgetData) {
        const totalCost = (usage || []).reduce((s, u) => s + (u.cost || 0), 0);
        setBudget({
          monthly_limit: budgetData.monthly_limit || 50,
          current: totalCost,
          hard_stop: budgetData.hard_stop ?? true,
        });
      }

      const tokens = (usage || []).reduce((s, u) => s + (u.tokens_in || 0) + (u.tokens_out || 0), 0);
      setTotalTokens(tokens);

      // Today's usage
      const today = new Date().toISOString().slice(0, 10);
      const todayRow = (usage || []).find(u => u.date === today);
      setTodayUsage({
        tokens: (todayRow?.tokens_in || 0) + (todayRow?.tokens_out || 0),
        cost: Number(todayRow?.cost) || 0,
      });

      setDailyUsage(
        (usage || []).map(u => ({
          date: format(new Date(u.date), "MMM dd"),
          cost: Number(u.cost) || 0,
        }))
      );

      setRecentRuns(runs || []);
      setLoading(false);
    })();
  }, [user]);

  // ── Realtime subscription for runs ──
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("dashboard-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runs", filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRecentRuns((prev) => {
              const newRun = { ...payload.new, agents: null };
              return [newRun, ...prev].slice(0, 10);
            });
          } else if (payload.eventType === "UPDATE") {
            setRecentRuns((prev) =>
              prev.map((r) => (r.id === payload.new.id ? { ...r, ...payload.new } : r))
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId]);

  // ── Load run events ──
  const openRunInspector = useCallback(async (runId: string) => {
    setSelectedRunId(runId);
    setEventsLoading(true);
    const { data } = await supabase
      .from("run_events")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    setRunEvents(data || []);
    setEventsLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const spendPercent = budget.monthly_limit > 0 ? (budget.current / budget.monthly_limit) * 100 : 0;

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const metrics = [
    { label: "Today's Tokens", value: formatTokens(todayUsage.tokens), icon: Zap },
    { label: "Today's Cost", value: `$${todayUsage.cost.toFixed(4)}`, icon: DollarSign },
    { label: "Active Agents", value: agentCount.toString(), icon: Bot },
    { label: "Connected Tools", value: toolCount.toString(), icon: Plug },
    { label: "Active Workflows", value: workflowCount.toString(), icon: Calendar },
  ];

  const getDuration = (run: any) => {
    if (!run.started_at) return "—";
    const start = new Date(run.started_at).getTime();
    const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now();
    const ms = end - start;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      <GoogleOAuthBanner />
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your AI operations at a glance</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map(m => (
          <Card key={m.label} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <m.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spending vs Limit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold">${budget.current.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">/ ${budget.monthly_limit}</span>
            </div>
            <Progress value={Math.min(spendPercent, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {spendPercent.toFixed(0)}% of monthly budget used
              {budget.hard_stop && " • Hard stop enabled"}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px]">
              {dailyUsage.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyUsage}>
                    <defs>
                      <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(218, 15%, 55%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(218, 15%, 55%)" tickFormatter={v => `$${v}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(224, 24%, 10%)",
                        border: "1px solid hsl(224, 16%, 18%)",
                        borderRadius: "8px",
                        fontSize: 12,
                      }}
                    />
                    <Area type="monotone" dataKey="cost" stroke="hsl(217, 91%, 60%)" fill="url(#colorCost)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No usage data yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Create Agent", icon: Bot, path: "/agents" },
              { label: "Connect Tool", icon: Plug, path: "/tools" },
              { label: "New Workflow", icon: Calendar, path: "/workflows" },
              { label: "MCP Test", icon: Zap, path: "/mcp-test" },
            ].map(action => (
              <Button key={action.label} variant="outline" className="w-full justify-between" onClick={() => navigate(action.path)}>
                <span className="flex items-center gap-2">
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Runs (Live)</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No runs yet</p>
            ) : (
              <div className="space-y-2">
                {recentRuns.map((run: any) => (
                  <button
                    key={run.id}
                    onClick={() => openRunInspector(run.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    {statusIcon[run.status] || statusIcon.pending}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {run.agents?.name || "Default agent"}
                        </span>
                        <Badge variant={statusBadgeVariant[run.status] ?? "outline"} className="text-[10px] px-1.5 py-0">
                          {run.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{format(new Date(run.created_at), "MMM dd HH:mm")}</span>
                        <span>{getDuration(run)}</span>
                        {run.total_tokens > 0 && <span>{formatTokens(run.total_tokens)} tok</span>}
                        {run.total_cost > 0 && <span>${Number(run.total_cost).toFixed(4)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Run Inspector Drawer */}
      <Sheet open={!!selectedRunId} onOpenChange={(open) => !open && setSelectedRunId(null)}>
        <SheetContent className="w-[450px] sm:w-[500px]">
          <SheetHeader>
            <SheetTitle className="font-display">Run Inspector</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : runEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No events recorded</p>
            ) : (
              <ScrollArea className="h-[calc(100vh-140px)]">
                <div className="relative space-y-0 pl-6">
                  {/* Timeline line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                  {runEvents.map((evt, idx) => (
                    <div key={evt.id} className="relative pb-4">
                      {/* Timeline dot */}
                      <div className={`absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                        evt.type === "error" ? "bg-destructive" :
                        evt.type === "approval_required" ? "bg-warning" :
                        evt.type === "tool_call" ? "bg-accent" :
                        "bg-primary"
                      }`} />

                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">
                            {eventTypeLabel[evt.type] ?? evt.type}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(evt.created_at), "HH:mm:ss.SSS")}
                          </span>
                        </div>

                        {evt.duration_ms != null && (
                          <p className="text-[10px] text-muted-foreground mb-1">{evt.duration_ms}ms</p>
                        )}

                        {evt.tokens_used > 0 && (
                          <p className="text-[10px] text-muted-foreground mb-1">
                            {formatTokens(evt.tokens_used)} tokens • ${Number(evt.cost).toFixed(4)}
                          </p>
                        )}

                        {evt.payload_json && Object.keys(evt.payload_json).length > 0 && (
                          <pre className="mt-1 text-[10px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-32">
                            {JSON.stringify(evt.payload_json, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
