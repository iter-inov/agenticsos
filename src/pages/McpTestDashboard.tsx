import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { MCP_TEST_PAYLOADS, type McpTestPayload } from "@/lib/mcpTestPayloads";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import {
  Play, PlayCircle, CheckCircle2, XCircle, AlertTriangle, Circle,
  Clock, ChevronDown, ChevronUp, RotateCcw, Loader2, Zap,
  Link2, Unplug, MessageSquare, ExternalLink,
} from "lucide-react";

type TestStatus = "untested" | "running" | "config_ok" | "success" | "error" | "config_missing" | "auth_missing";

interface ToolTestState {
  payload: McpTestPayload;
  status: TestStatus;
  response?: any;
  error?: string;
  durationMs?: number;
  expanded: boolean;
  realApi?: boolean;
}

const STATUS_CONFIG: Record<TestStatus, { icon: React.ElementType; label: string; color: string }> = {
  untested: { icon: Circle, label: "Not tested", color: "text-muted-foreground" },
  running: { icon: Loader2, label: "Running…", color: "text-primary" },
  config_ok: { icon: AlertTriangle, label: "Config OK", color: "text-[hsl(var(--warning,45_93%_47%))]" },
  success: { icon: CheckCircle2, label: "Success", color: "text-[hsl(var(--success,142_76%_36%))]" },
  error: { icon: XCircle, label: "Error", color: "text-destructive" },
  config_missing: { icon: AlertTriangle, label: "Config Missing", color: "text-destructive" },
  auth_missing: { icon: Unplug, label: "Auth Missing", color: "text-destructive" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "google-workspace": "Google Workspace",
  productivity: "Productivity",
  automation: "Automation",
  messaging: "Messaging",
  "social-media": "Social Media",
  finance: "Finance",
};

function getResponseSummary(toolName: string, response: any): string | null {
  if (!response) return null;
  if (toolName === "slack_list_channels" && response.channels)
    return `${response.channels.length} channel(s): ${response.channels.map((c: any) => `#${c.name}`).join(", ")}`;
  if (toolName === "slack_send_message" && response.message_sent)
    return `✅ Message sent to channel ${response.channel}`;
  if (toolName === "gmail_read_inbox" && response.messages)
    return `${response.messages.length} email(s): ${response.messages.map((m: any) => m.subject).join(", ")}`;
  if (toolName === "gdrive_search" && response.files)
    return `${response.files.length} file(s): ${response.files.map((f: any) => f.name).join(", ")}`;
  if (toolName === "calendar_list_events" && response.events)
    return `${response.events.length} event(s): ${response.events.map((e: any) => e.title).join(", ")}`;
  if (response.dry_run) return `🧪 ${response.message}`;
  return null;
}

export default function McpTestDashboard() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [searchParams] = useSearchParams();
  const [tools, setTools] = useState<ToolTestState[]>([]);
  const [runningAll, setRunningAll] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email?: string; expiresAt?: string } | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [slackDiag, setSlackDiag] = useState<{ running: boolean; result?: any; error?: string; lastSuccess?: string }>({ running: false });

  // Check for Google OAuth callback params
  useEffect(() => {
    const googleAuth = searchParams.get("google_auth");
    const email = searchParams.get("email");
    if (googleAuth === "success") {
      toast({ title: "Google connecté ✅", description: `Compte ${email ?? ""} — 4 outils Google actifs` });
    } else if (googleAuth === "error") {
      const msg = searchParams.get("message") ?? "Unknown error";
      toast({ title: "Erreur Google OAuth", description: msg, variant: "destructive" });
    }
  }, [searchParams]);

  // Check Google OAuth status
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("oauth_tokens" as any)
      .select("user_email, expires_at")
      .eq("org_id", orgId)
      .eq("provider", "google")
      .single()
      .then(({ data }) => {
        if (data) {
          setGoogleStatus({
            connected: true,
            email: (data as any).user_email,
            expiresAt: (data as any).expires_at,
          });
        } else {
          setGoogleStatus({ connected: false });
        }
      });
  }, [orgId, searchParams]);

  useEffect(() => {
    setTools(MCP_TEST_PAYLOADS.map((p) => ({ payload: p, status: "untested", expanded: false })));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("mcp_test_results" as any)
      .select("*")
      .eq("org_id", orgId)
      .order("tested_at", { ascending: false })
      .limit(50)
      .then(({ data }) => { if (data) setHistory(data); });
  }, [orgId]);

  const runSingleTest = useCallback(
    async (index: number) => {
      if (!orgId) return;
      const tool = tools[index];
      setTools((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], status: "running", response: undefined, error: undefined, realApi: undefined };
        return next;
      });

      try {
        const { data, error } = await supabase.functions.invoke("mcp-test-runner", {
          body: { tool_name: tool.payload.toolName, test_payload: tool.payload.payload, org_id: orgId },
        });
        if (error) throw error;

        setTools((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: (data?.status as TestStatus) ?? "error",
            response: data?.response,
            error: data?.error,
            durationMs: data?.duration_ms,
            realApi: data?.real_api ?? false,
          };
          return next;
        });
      } catch (err: any) {
        setTools((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], status: "error", error: err.message ?? "Unknown error", realApi: false };
          return next;
        });
      }
    },
    [orgId, tools],
  );

  const runAllTests = async () => {
    if (!orgId) return;
    setRunningAll(true);
    setProgress(0);
    for (let i = 0; i < tools.length; i++) {
      await runSingleTest(i);
      setProgress(Math.round(((i + 1) / tools.length) * 100));
    }
    setRunningAll(false);
    toast({ title: "All tests complete" });
    const { data } = await supabase
      .from("mcp_test_results" as any).select("*").eq("org_id", orgId)
      .order("tested_at", { ascending: false }).limit(50);
    if (data) setHistory(data);
  };

  const toggleExpand = (index: number) => {
    setTools((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], expanded: !next[index].expanded };
      return next;
    });
  };

  // ── Slack Diagnostic ──
  const runSlackDiagnostic = async () => {
    if (!orgId) return;
    setSlackDiag({ running: true });

    try {
      const { data, error } = await supabase.functions.invoke("mcp-test-runner", {
        body: { tool_name: "slack_list_channels", test_payload: { limit: 20 }, org_id: orgId },
      });
      if (error) throw error;

      setSlackDiag({
        running: false,
        result: data,
        lastSuccess: data?.status === "success" ? new Date().toISOString() : undefined,
      });
    } catch (err: any) {
      setSlackDiag({ running: false, error: err.message });
    }
  };

  // ── Google OAuth ──
  const startGoogleOAuth = async () => {
    if (!orgId) return;
    setConnectingGoogle(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth-start", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (err: any) {
      toast({ title: "Google OAuth error", description: err.message, variant: "destructive" });
      setConnectingGoogle(false);
    }
  };

  const categories = Array.from(new Set(MCP_TEST_PAYLOADS.map((p) => p.category)));
  const successCount = tools.filter((t) => t.status === "success").length;
  const errorCount = tools.filter((t) => ["error", "config_missing", "auth_missing"].includes(t.status)).length;
  const realApiCount = tools.filter((t) => t.realApi === true && t.status === "success").length;

  if (orgLoading) return <Skeleton className="h-96 w-full" />;

  const unconnectedTools = MCP_TEST_PAYLOADS.filter((p) => !p.realApiAvailable);
  const unconnectedCategories = Array.from(new Set(unconnectedTools.map((t) => t.category)));

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">MCP Test Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Validate the MCP pipeline end-to-end with real and mock API calls
          </p>
        </div>
        <Button onClick={runAllTests} disabled={runningAll} size="lg">
          {runningAll ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
          ) : (
            <><PlayCircle className="h-4 w-4" /> Test All ({tools.length})</>
          )}
        </Button>
      </div>

      {/* Progress */}
      {runningAll && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Running tests…</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="flex gap-4 flex-wrap">
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success,142_76%_36%))]" />
          {successCount} passed
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <XCircle className="h-3.5 w-3.5 text-destructive" />
          {errorCount} failed
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          {tools.length - successCount - errorCount} pending
        </Badge>
        {realApiCount > 0 && (
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm border-[hsl(var(--success,142_76%_36%))]">
            <Zap className="h-3.5 w-3.5 text-[hsl(var(--success,142_76%_36%))]" />
            {realApiCount} real API
          </Badge>
        )}
      </div>

      {/* ── Slack Diagnostic Panel ── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Slack — Diagnostic en temps réel
            </CardTitle>
            <Button size="sm" onClick={runSlackDiagnostic} disabled={slackDiag.running}>
              {slackDiag.running ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Testing…</>
              ) : (
                <><Zap className="h-3.5 w-3.5 mr-1.5" />Tester Slack maintenant</>
              )}
            </Button>
          </div>
          {slackDiag.lastSuccess && (
            <p className="text-xs text-muted-foreground">
              ✅ Dernier test réussi : {new Date(slackDiag.lastSuccess).toLocaleString()}
            </p>
          )}
        </CardHeader>
        {(slackDiag.result || slackDiag.error) && (
          <CardContent className="pt-0 space-y-2">
            {slackDiag.result?.status === "success" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[hsl(var(--success,142_76%_36%))] border-[hsl(var(--success,142_76%_36%))]">
                    <Zap className="h-3 w-3 mr-1" /> Real API
                  </Badge>
                  <span className="text-xs text-muted-foreground">{slackDiag.result.duration_ms}ms</span>
                </div>
                <div className="bg-muted rounded-md p-3 text-xs space-y-1">
                  {slackDiag.result.response?.channels?.map((ch: any) => (
                    <div key={ch.id} className="flex items-center justify-between">
                      <span className="font-mono text-foreground">#{ch.name}</span>
                      <div className="flex gap-2 text-muted-foreground">
                        <span>{ch.num_members} members</span>
                        {ch.is_member && <Badge variant="secondary" className="text-[9px] px-1 py-0">joined</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(slackDiag.result?.status === "error" || slackDiag.error) && (
              <pre className="text-xs bg-destructive/10 text-destructive p-3 rounded-md overflow-x-auto">
                {slackDiag.error ?? slackDiag.result?.error}
              </pre>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Google OAuth Panel ── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google Workspace — OAuth
              </CardTitle>
              <CardDescription>
                Gmail, Drive, Calendar en une seule connexion
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {googleStatus?.connected ? (
                <Badge variant="outline" className="text-[hsl(var(--success,142_76%_36%))] border-[hsl(var(--success,142_76%_36%))]">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {googleStatus.email}
                </Badge>
              ) : (
                <Button size="sm" onClick={startGoogleOAuth} disabled={connectingGoogle}>
                  {connectingGoogle ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Connecting…</>
                  ) : (
                    <><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Connecter Google</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {googleStatus?.connected ? (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>✅ Connecté — Gmail, Drive et Calendar disponibles en Real API</p>
              {googleStatus.expiresAt && (
                <p>Token expire : {new Date(googleStatus.expiresAt).toLocaleString()} (auto-refresh activé)</p>
              )}
              <p className="text-[hsl(var(--success,142_76%_36%))]">
                Scopes : gmail.modify, drive.readonly, calendar.readonly
              </p>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                Pour activer les vrais appels Gmail, Drive et Calendar, vous devez connecter votre compte Google.
              </p>
              <div className="bg-muted p-3 rounded-md space-y-1">
                <p className="font-medium text-foreground">Prérequis :</p>
                <p>1. Créer un projet Google Cloud Console</p>
                <p>2. Activer Gmail API, Drive API, Calendar API</p>
                <p>3. Créer des credentials OAuth 2.0 (Web application)</p>
                <p>4. Ajouter le Redirect URI : <code className="bg-background px-1 rounded text-foreground">{`https://aimxmxldndrlgfgpxxzh.supabase.co/functions/v1/google-oauth-callback`}</code></p>
                <p>5. Ajouter les secrets GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET (déjà fait ✅)</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tool cards by category */}
      {categories.map((cat) => (
        <div key={cat} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            {CATEGORY_LABELS[cat] ?? cat}
          </h2>
          <div className="space-y-2">
            {tools
              .map((t, i) => ({ ...t, index: i }))
              .filter((t) => t.payload.category === cat)
              .map((tool) => {
                const cfg = STATUS_CONFIG[tool.status];
                const Icon = cfg.icon;
                const summary = tool.status === "success" ? getResponseSummary(tool.payload.toolName, tool.response) : null;
                return (
                  <Card key={tool.payload.toolName}>
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Icon className={`h-5 w-5 shrink-0 ${cfg.color} ${tool.status === "running" ? "animate-spin" : ""}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{tool.payload.displayName}</p>
                            {tool.status !== "untested" && tool.status !== "running" && (
                              tool.realApi ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 border-[hsl(var(--success,142_76%_36%))] text-[hsl(var(--success,142_76%_36%))]">
                                  <Zap className="h-2.5 w-2.5" /> Real API
                                </Badge>
                              ) : tool.status === "config_missing" ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 text-muted-foreground">
                                  <Circle className="h-2.5 w-2.5" /> Config Missing
                                </Badge>
                              ) : tool.status === "auth_missing" ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 text-destructive">
                                  <Unplug className="h-2.5 w-2.5" /> Auth Required
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 text-[hsl(var(--warning,45_93%_47%))]">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Mock
                                </Badge>
                              )
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {summary ?? tool.payload.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {tool.durationMs != null && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />{tool.durationMs}ms
                          </span>
                        )}
                        <Badge variant="secondary" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                        <Button variant="ghost" size="icon" onClick={() => runSingleTest(tool.index)} disabled={tool.status === "running" || runningAll}>
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleExpand(tool.index)}>
                          {tool.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    {tool.expanded && (
                      <CardContent className="pt-0 pb-4 space-y-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Request Payload</p>
                          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto text-foreground">
                            {JSON.stringify(tool.payload.payload, null, 2)}
                          </pre>
                        </div>
                        {tool.response && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Response</p>
                            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 text-foreground">
                              {JSON.stringify(tool.response, null, 2)}
                            </pre>
                          </div>
                        )}
                        {tool.error && (
                          <div>
                            <p className="text-xs font-medium text-destructive mb-1">Error</p>
                            <pre className="text-xs bg-destructive/10 text-destructive p-3 rounded-md overflow-x-auto">{tool.error}</pre>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
          </div>
        </div>
      ))}

      {/* Missing connections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Outils non connectés
          </CardTitle>
          <CardDescription>
            Ces outils fonctionnent en mode mock. Connectez-les pour activer les vrais appels API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {unconnectedCategories.map((cat) => (
              <div key={cat}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{CATEGORY_LABELS[cat] ?? cat}</p>
                <div className="flex flex-wrap gap-2">
                  {unconnectedTools.filter((t) => t.category === cat).map((t) => (
                    <Badge key={t.toolName} variant="outline" className="gap-1.5 text-xs text-muted-foreground">
                      <Unplug className="h-3 w-3" />
                      {t.displayName.split(" – ")[0]}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Recent Test Results
            </CardTitle>
            <CardDescription>Last 50 test executions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between text-xs p-2 rounded-md bg-muted">
                  <div className="flex items-center gap-2">
                    {h.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success,142_76%_36%))]" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className="font-mono text-foreground">{h.tool_name}</span>
                    {h.response_preview?.real_api && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-[hsl(var(--success,142_76%_36%))]">Real</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    {h.duration_ms != null && <span>{h.duration_ms}ms</span>}
                    <span>{new Date(h.tested_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
