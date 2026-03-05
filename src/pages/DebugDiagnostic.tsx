import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, Zap, RefreshCw,
  Database, Link2, Bot, Key, Clock, Play,
} from "lucide-react";

type DiagStatus = "loading" | "ok" | "warning" | "error" | "empty";

interface DiagSection {
  title: string;
  icon: React.ElementType;
  status: DiagStatus;
  data: any;
  problems: string[];
}

const STATUS_ICON: Record<DiagStatus, { icon: React.ElementType; color: string; label: string }> = {
  loading: { icon: Loader2, color: "text-muted-foreground", label: "Chargement..." },
  ok: { icon: CheckCircle2, color: "text-[hsl(142_76%_36%)]", label: "✅ OK" },
  warning: { icon: AlertTriangle, color: "text-[hsl(45_93%_47%)]", label: "⚠️ Attention" },
  error: { icon: XCircle, color: "text-destructive", label: "🔴 Problème" },
  empty: { icon: AlertTriangle, color: "text-destructive", label: "⚠️ Vide" },
};

export default function DebugDiagnostic() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [sections, setSections] = useState<Record<string, DiagSection>>({});
  const [directTestResult, setDirectTestResult] = useState<any>(null);
  const [directTestLoading, setDirectTestLoading] = useState(false);
  const [allProblems, setAllProblems] = useState<string[]>([]);

  const updateSection = (key: string, update: Partial<DiagSection>) => {
    setSections(prev => ({
      ...prev,
      [key]: { ...prev[key], ...update },
    }));
  };

  useEffect(() => {
    if (!orgId || orgLoading) return;
    runAllDiagnostics();
  }, [orgId, orgLoading]);

  useEffect(() => {
    const problems = Object.values(sections).flatMap(s => s.problems ?? []);
    setAllProblems(problems);
  }, [sections]);

  async function runAllDiagnostics() {
    if (!orgId) return;

    // Init all sections
    const initialSections: Record<string, DiagSection> = {
      tool_connections: { title: "1. Tool Connections actives", icon: Link2, status: "loading", data: null, problems: [] },
      mcp_tools: { title: "2. MCP Tools compilés", icon: Database, status: "loading", data: null, problems: [] },
      agent_tools: { title: "3. Agent Tools assignés", icon: Bot, status: "loading", data: null, problems: [] },
      oauth_tokens: { title: "4. OAuth Tokens", icon: Key, status: "loading", data: null, problems: [] },
      secrets: { title: "5. Secrets configurés", icon: Key, status: "loading", data: null, problems: [] },
      scheduler: { title: "6. Scheduler & Scheduled Runs", icon: Clock, status: "loading", data: null, problems: [] },
      schedule_runs: { title: "7. Runs source=schedule", icon: Play, status: "loading", data: null, problems: [] },
      tool_proxy_analysis: { title: "8. Analyse tool-proxy", icon: Zap, status: "loading", data: null, problems: [] },
    };
    setSections(initialSections);

    // Run all queries in parallel
    const [
      toolConns,
      mcpTools,
      agentTools,
      oauthTokens,
      secrets,
      scheduledRuns,
      scheduleSourceRuns,
    ] = await Promise.all([
      supabase.from("tool_connections").select("*, tools(slug, name)").eq("org_id", orgId).eq("status", "connected"),
      supabase.from("mcp_tools").select("name, risk_level, requires_approval, server_id, mcp_servers(label)").eq("org_id", orgId),
      supabase.from("agent_tools").select("id, agent_id, tool_id, mcp_tool_id, agents(name), mcp_tools(name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("oauth_tokens" as any).select("provider, expires_at, user_email, org_id").eq("org_id", orgId),
      supabase.from("secrets" as any).select("name, org_id, created_at").eq("org_id", orgId),
      supabase.from("scheduled_runs").select("id, status, next_run_at, last_run_at, workflows(name, is_active)").order("next_run_at", { ascending: false }).limit(10),
      supabase.from("runs").select("id, status, source, created_at, agent_id, agents(name)").eq("source", "schedule").eq("org_id", orgId).order("created_at", { ascending: false }).limit(5),
    ]);

    // 1. Tool connections
    const tcData = toolConns.data ?? [];
    const tcProblems: string[] = [];
    if (tcData.length === 0) tcProblems.push("Aucune tool_connection active — les outils ne peuvent pas fonctionner");
    updateSection("tool_connections", {
      status: tcData.length > 0 ? "ok" : "empty",
      data: tcData,
      problems: tcProblems,
    });

    // 2. MCP tools
    const mtData = mcpTools.data ?? [];
    const mtProblems: string[] = [];
    if (mtData.length === 0) mtProblems.push("Aucun mcp_tool — le LLM n'aura aucun outil disponible");
    updateSection("mcp_tools", {
      status: mtData.length > 0 ? "ok" : "error",
      data: mtData,
      problems: mtProblems,
    });

    // 3. Agent tools
    const atData = agentTools.data ?? [];
    const atProblems: string[] = [];
    if (atData.length === 0) {
      atProblems.push("CRITIQUE: agent_tools est VIDE — aucun agent n'a d'outil assigné");
      atProblems.push("→ run-agent utilise le fallback mcp_tools (tous les outils pour l'org)");
    } else {
      const missingMcpToolId = atData.filter((r: any) => !r.mcp_tool_id);
      if (missingMcpToolId.length > 0) {
        atProblems.push(`⚠️ ${missingMcpToolId.length} agent_tools sans mcp_tool_id — run-agent ne pourra pas les charger`);
      }
    }
    updateSection("agent_tools", {
      status: atData.length > 0 ? "ok" : "warning",
      data: atData,
      problems: atProblems,
    });

    // 4. OAuth tokens
    const otData = oauthTokens.data ?? [];
    const otProblems: string[] = [];
    if (otData.length === 0) {
      otProblems.push("Aucun oauth_token — Gmail, Drive, Calendar ne fonctionneront PAS");
      otProblems.push("→ tool-proxy retournera 'Google OAuth not connected' pour ces outils");
    } else {
      for (const t of otData as any[]) {
        if (t.expires_at && new Date(t.expires_at) < new Date()) {
          otProblems.push(`Token ${t.provider} expiré depuis ${t.expires_at}`);
        }
      }
    }
    updateSection("oauth_tokens", {
      status: otData.length > 0 ? (otProblems.length > 0 ? "warning" : "ok") : "error",
      data: otData,
      problems: otProblems,
    });

    // 5. Secrets
    const sData = secrets.data ?? [];
    const sProblems: string[] = [];
    if (sData.length === 0) {
      sProblems.push("Aucun secret dans la table secrets — WhatsApp, Telegram, X, Instagram, Facebook ne fonctionneront PAS");
      sProblems.push("→ Note: Slack utilise SLACK_API_KEY (env var Deno), pas la table secrets");
    }
    updateSection("secrets", {
      status: sData.length > 0 ? "ok" : "warning",
      data: sData.map((s: any) => ({ name: s.name, org_id: s.org_id, created_at: s.created_at })),
      problems: sProblems,
    });

    // 6. Scheduler
    const srData = scheduledRuns.data ?? [];
    const srProblems: string[] = [];
    if (srData.length === 0) {
      srProblems.push("Aucun scheduled_run — le scheduler n'a rien à déclencher");
      srProblems.push("→ Créez un workflow avec trigger_type='cron' et un scheduled_run associé");
    }
    updateSection("scheduler", {
      status: srData.length > 0 ? "ok" : "empty",
      data: srData,
      problems: srProblems,
    });

    // 7. Schedule source runs
    const ssrData = scheduleSourceRuns.data ?? [];
    const ssrProblems: string[] = [];
    if (ssrData.length === 0) {
      ssrProblems.push("Aucun run source=schedule — le scheduler n'a jamais déclenché de run");
    }
    updateSection("schedule_runs", {
      status: ssrData.length > 0 ? "ok" : "empty",
      data: ssrData,
      problems: ssrProblems,
    });

    // 8. Tool proxy analysis
    const handlerNames = [
      "slack_list_channels", "slack_send_message",
      "gmail_read_inbox", "gdrive_search", "calendar_list_events",
      "whatsapp_send_message", "whatsapp_send_template",
      "telegram_send_message", "telegram_send_photo", "telegram_get_updates",
      "x_get_me", "x_post_tweet", "x_search_tweets",
      "instagram_get_profile", "instagram_get_media",
      "facebook_post", "facebook_get_posts",
    ];

    const tpProblems: string[] = [];
    const tpAnalysis = {
      handlers: handlerNames,
      slack: {
        credentials: "LOVABLE_API_KEY (Deno.env) + SLACK_API_KEY (Deno.env — managed by connector)",
        behavior: "Appelle connector-gateway.lovable.dev/slack/api — REAL API",
      },
      gmail: {
        credentials: "oauth_tokens table (provider='google') — refresh_token flow",
        problem: otData.length === 0 ? "🔴 Pas de token Google dans oauth_tokens" : "OK",
      },
      default_behavior: "Pas de case 'default' — si tool_slug ne matche pas un handler, retourne { ok: false, error: 'Tool not available' }. PAS de mock.",
    };

    if (otData.length === 0) {
      tpProblems.push("Gmail/Drive/Calendar : oauth_tokens vide → getGoogleAccessToken() retourne null → throw 'Google OAuth not connected'");
    }

    updateSection("tool_proxy_analysis", {
      status: tpProblems.length > 0 ? "warning" : "ok",
      data: tpAnalysis,
      problems: tpProblems,
    });
  }

  // Direct tool-proxy test
  async function testToolProxyDirect() {
    if (!orgId) return;
    setDirectTestLoading(true);
    setDirectTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("tool-proxy", {
        body: {
          tool_slug: "slack_list_channels",
          action: "execute",
          args: { limit: 5 },
          org_id: orgId,
          debug: true,
        },
      });
      setDirectTestResult({ success: !error, data, error: error?.message });
    } catch (err: any) {
      setDirectTestResult({ success: false, error: err.message });
    } finally {
      setDirectTestLoading(false);
    }
  }

  if (orgLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🔍 Diagnostic Complet</h1>
          <p className="text-sm text-muted-foreground">
            Analyse de la chaîne de données outils → agents → tool-proxy → scheduler
          </p>
        </div>
        <Button onClick={runAllDiagnostics} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Relancer
        </Button>
      </div>

      {/* Summary */}
      {allProblems.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              {allProblems.length} problème(s) détecté(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5 text-sm">
              {allProblems.map((p, i) => (
                <li key={i} className="text-destructive/90">{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Sections */}
      {Object.entries(sections).map(([key, section]) => {
        const statusInfo = STATUS_ICON[section.status];
        const StatusIcon = statusInfo.icon;

        return (
          <Card key={key} className={section.status === "error" ? "border-destructive/40" : section.status === "warning" ? "border-[hsl(45_93%_47%)]/40" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <section.icon className="h-4 w-4 text-muted-foreground" />
                  {section.title}
                </CardTitle>
                <Badge variant="outline" className={`${statusInfo.color} gap-1`}>
                  <StatusIcon className={`h-3 w-3 ${section.status === "loading" ? "animate-spin" : ""}`} />
                  {statusInfo.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Problems */}
              {section.problems.length > 0 && (
                <div className="bg-destructive/10 rounded-md p-3 space-y-1">
                  {section.problems.map((p, i) => (
                    <p key={i} className="text-xs text-destructive">{p}</p>
                  ))}
                </div>
              )}

              {/* Data */}
              {section.data && (
                <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-60 overflow-y-auto text-foreground">
                  {JSON.stringify(section.data, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Direct tool-proxy test */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Test Direct tool-proxy — slack_list_channels
            </CardTitle>
            <Button size="sm" onClick={testToolProxyDirect} disabled={directTestLoading}>
              {directTestLoading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Testing…</>
              ) : (
                <><Play className="h-3.5 w-3.5 mr-1.5" />Tester</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Appelle tool-proxy directement avec debug=true pour voir handler, credentials, et type de réponse
          </p>
        </CardHeader>
        {directTestResult && (
          <CardContent className="pt-0">
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-80 overflow-y-auto text-foreground">
              {JSON.stringify(directTestResult, null, 2)}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}