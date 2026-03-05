import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Clock, Mail, Share2, Bot, Sparkles, Loader2,
  Instagram, Facebook, TrendingUp, TrendingDown, Minus, RefreshCw,
} from "lucide-react";

function getMonday(offset: number) {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1 + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function Variation({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null || previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous * 100).toFixed(1);
  const num = parseFloat(pct);
  if (num > 0) return <span className="text-xs font-medium text-green-600 flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{pct}%</span>;
  if (num < 0) return <span className="text-xs font-medium text-destructive flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{pct}%</span>;
  return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />0%</span>;
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function Reports() {
  const { orgId } = useOrgId();
  const [weekOffset, setWeekOffset] = useState(0);
  const [report, setReport] = useState<any>(null);
  const [prevReport, setPrevReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Live data for charts
  const [emailData, setEmailData] = useState<any[]>([]);
  const [socialPosts, setSocialPosts] = useState<any[]>([]);

  const monday = useMemo(() => getMonday(weekOffset), [weekOffset]);
  const sunday = useMemo(() => { const s = new Date(monday); s.setDate(monday.getDate() + 6); return s; }, [monday]);
  const weekStartStr = monday.toISOString().slice(0, 10);
  const prevWeekStartStr = useMemo(() => { const m = getMonday(weekOffset - 1); return m.toISOString().slice(0, 10); }, [weekOffset]);

  const fetchReport = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: curr }, { data: prev }] = await Promise.all([
      supabase.from("weekly_reports" as any).select("*").eq("org_id", orgId).eq("week_start", weekStartStr).maybeSingle(),
      supabase.from("weekly_reports" as any).select("*").eq("org_id", orgId).eq("week_start", prevWeekStartStr).maybeSingle(),
    ]);
    setReport(curr);
    setPrevReport(prev);

    // Also fetch live data for charts
    const start = monday.toISOString();
    const end = new Date(sunday.getTime() + 86400000).toISOString();
    const [{ data: emails }, { data: posts }] = await Promise.all([
      (supabase as any).from("email_inbox").select("status, received_at").eq("org_id", orgId).gte("received_at", start).lt("received_at", end),
      (supabase as any).from("social_posts").select("platform, status, engagement_json").eq("org_id", orgId).gte("created_at", start).lt("created_at", end),
    ]);
    setEmailData(emails ?? []);
    setSocialPosts(posts ?? []);
    setLoading(false);
  }, [orgId, weekStartStr, prevWeekStartStr, monday, sunday]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const generateReport = async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ org_id: orgId, week_start: weekStartStr }),
      });
      await fetchReport();
    } catch {} finally { setGenerating(false); }
  };

  const m = report?.metrics || {};
  const pm = prevReport?.metrics || null;

  // Fallback to live calculation if no report
  const emailsReceived = m.emails_received ?? emailData.length;
  const emailsReplied = m.emails_replied ?? emailData.filter((e: any) => e.status === "replied").length;
  const postsPublished = m.posts_published ?? socialPosts.filter((p: any) => p.status === "published").length;
  const runsExecuted = m.runs_executed ?? 0;
  const timeSavedH = m.time_saved_minutes ? Math.round(m.time_saved_minutes / 60 * 10) / 10 : Math.round((emailsReplied * 5 + postsPublished * 30) / 60 * 10) / 10;

  // Chart data
  const emailChartData = DAYS.map((day, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    return {
      day,
      received: emailData.filter((e: any) => e.received_at?.startsWith(dateStr)).length,
      replied: emailData.filter((e: any) => e.received_at?.startsWith(dateStr) && e.status === "replied").length,
    };
  });

  const igPosts = socialPosts.filter((p: any) => p.platform === "instagram");
  const fbPosts = socialPosts.filter((p: any) => p.platform === "facebook");
  const sumEngagement = (posts: any[]) => posts.reduce((a, p) => {
    const e = p.engagement_json || {};
    return { likes: a.likes + (e.likes || 0), comments: a.comments + (e.comments || 0), reach: a.reach + (e.reach || 0) };
  }, { likes: 0, comments: 0, reach: 0 });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Rapports</h1>
          <p className="text-sm text-muted-foreground">
            Semaine du {formatDate(monday)} au {formatDate(sunday)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Cette semaine</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8 max-w-5xl mx-auto">
          {/* Generate / refresh banner */}
          {!report && !loading && (
            <Card className="p-4 flex items-center justify-between bg-muted/30">
              <p className="text-sm text-muted-foreground">Aucun rapport pour cette semaine.</p>
              <Button size="sm" onClick={generateReport} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Générer ce rapport
              </Button>
            </Card>
          )}
          {report && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={generateReport} disabled={generating} className="gap-2 text-muted-foreground">
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Régénérer
              </Button>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center space-y-1">
              <Clock className="h-5 w-5 mx-auto text-primary" />
              <p className="text-2xl font-bold text-foreground">{timeSavedH}h</p>
              <p className="text-xs text-muted-foreground">Temps économisé</p>
              {pm && <Variation current={m.time_saved_minutes || 0} previous={pm.time_saved_minutes} />}
            </Card>
            <Card className="p-4 text-center space-y-1">
              <Mail className="h-5 w-5 mx-auto text-blue-500" />
              <p className="text-2xl font-bold text-foreground">{emailsReplied}/{emailsReceived}</p>
              <p className="text-xs text-muted-foreground">Emails traités</p>
              {pm && <Variation current={emailsReplied} previous={pm.emails_replied} />}
            </Card>
            <Card className="p-4 text-center space-y-1">
              <Share2 className="h-5 w-5 mx-auto text-pink-500" />
              <p className="text-2xl font-bold text-foreground">{postsPublished}</p>
              <p className="text-xs text-muted-foreground">Posts publiés</p>
              {pm && <Variation current={postsPublished} previous={pm.posts_published} />}
            </Card>
            <Card className="p-4 text-center space-y-1">
              <Bot className="h-5 w-5 mx-auto text-purple-500" />
              <p className="text-2xl font-bold text-foreground">{runsExecuted}</p>
              <p className="text-xs text-muted-foreground">Runs exécutés</p>
              {pm && <Variation current={runsExecuted} previous={pm.runs_executed} />}
            </Card>
          </div>

          {/* Email chart */}
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" /> Emails — Reçus vs Traités
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={emailChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="received" fill="hsl(var(--primary) / 0.3)" name="Reçus" radius={[4, 4, 0, 0]} />
                <Bar dataKey="replied" fill="hsl(var(--primary))" name="Répondus" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Social media */}
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-pink-500" /> Social Media
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Instagram, label: "Instagram", posts: igPosts, eng: sumEngagement(igPosts) },
                { icon: Facebook, label: "Facebook", posts: fbPosts, eng: sumEngagement(fbPosts) },
              ].map(({ icon: Icon, label, posts, eng }) => (
                <div key={label} className="rounded-lg bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center gap-2"><Icon className="h-4 w-4" /><span className="text-sm font-medium text-foreground">{label}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-bold text-foreground">{posts.filter((p: any) => p.status === "published").length}</p><p className="text-[10px] text-muted-foreground">Posts</p></div>
                    <div><p className="text-lg font-bold text-foreground">{eng.likes}</p><p className="text-[10px] text-muted-foreground">Likes</p></div>
                    <div><p className="text-lg font-bold text-foreground">{eng.reach}</p><p className="text-[10px] text-muted-foreground">Portée</p></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Agents & cost */}
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-500" /> Agents & Workflows
            </h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><p className="text-2xl font-bold text-foreground">{runsExecuted}</p><p className="text-xs text-muted-foreground">Runs</p></div>
              <div><p className="text-2xl font-bold text-foreground">{m.runs_completed ?? 0}</p><p className="text-xs text-muted-foreground">Complétés</p></div>
              <div><p className="text-2xl font-bold text-foreground">${(m.llm_cost ?? 0).toFixed(2)}</p><p className="text-xs text-muted-foreground">Coût LLM</p></div>
            </div>
          </Card>

          {/* AI Insights */}
          <Card className="p-6 bg-primary/5 border-primary/20">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Insights IA
            </h2>
            {report?.insights ? (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{report.insights}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {report ? "Aucun insight généré pour ce rapport." : "Générez le rapport pour obtenir des insights IA."}
              </p>
            )}
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
