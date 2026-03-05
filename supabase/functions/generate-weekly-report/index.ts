import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function generateWeeklyReport(sb: any, orgId: string, weekStartStr: string) {
  const weekStart = new Date(weekStartStr);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addDays(weekStart, 7);

  const wStart = weekStart.toISOString();
  const wEnd = weekEnd.toISOString();
  const wStartDate = weekStartStr;
  const wEndDate = addDays(weekStart, 6).toISOString().slice(0, 10);

  // 1. Email metrics
  const { data: emails } = await sb
    .from("email_inbox")
    .select("status, ai_label, received_at")
    .eq("org_id", orgId)
    .gte("received_at", wStart)
    .lt("received_at", wEnd);
  const emailList = emails ?? [];

  // 2. Social media metrics
  const { data: posts } = await sb
    .from("social_posts")
    .select("platform, status, engagement_json, published_at")
    .eq("org_id", orgId)
    .gte("created_at", wStart)
    .lt("created_at", wEnd);
  const postList = posts ?? [];
  const publishedPosts = postList.filter((p: any) => p.status === "published");

  // 3. Agent/workflow metrics
  const { data: runs } = await sb
    .from("runs")
    .select("status, total_tokens, total_cost, created_at")
    .eq("org_id", orgId)
    .gte("created_at", wStart)
    .lt("created_at", wEnd);
  const runList = runs ?? [];

  // 4. Usage cost
  const { data: usage } = await sb
    .from("usage_daily")
    .select("cost")
    .eq("org_id", orgId)
    .gte("date", wStartDate)
    .lte("date", wEndDate);
  const totalLLMCost = (usage ?? []).reduce((s: number, u: any) => s + (u.cost || 0), 0);

  // 5. Time saved calculation (minutes)
  const emailsReplied = emailList.filter((e: any) => e.status === "replied").length;
  const timeSavedMinutes = emailsReplied * 5 + publishedPosts.length * 30 + runList.length * 2;

  const totalEngagement = publishedPosts.reduce((s: number, p: any) => {
    const e = p.engagement_json || {};
    return s + (e.likes || 0) + (e.comments || 0);
  }, 0);

  const metrics = {
    time_saved_minutes: timeSavedMinutes,
    emails_received: emailList.length,
    emails_replied: emailsReplied,
    emails_urgent: emailList.filter((e: any) => e.ai_label === "urgent").length,
    posts_published: publishedPosts.length,
    posts_total: postList.length,
    posts_ig: postList.filter((p: any) => p.platform === "instagram").length,
    posts_fb: postList.filter((p: any) => p.platform === "facebook").length,
    total_engagement: totalEngagement,
    runs_executed: runList.length,
    runs_completed: runList.filter((r: any) => r.status === "completed").length,
    runs_failed: runList.filter((r: any) => r.status === "failed").length,
    llm_cost: totalLLMCost,
  };

  // 6. Generate AI insights
  let insights = "";
  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Tu génères des insights hebdomadaires courts et actionnables pour un tableau de bord PME. 2-3 insights max, ton conversationnel et positif, en français. Max 3 phrases par insight.",
          },
          {
            role: "user",
            content: `Données de la semaine du ${wStartDate} :
- Emails reçus : ${metrics.emails_received}, répondus : ${metrics.emails_replied}, urgents : ${metrics.emails_urgent}
- Posts social media : ${metrics.posts_published} publiés (IG: ${metrics.posts_ig}, FB: ${metrics.posts_fb}), engagement total : ${metrics.total_engagement}
- Runs d'agents : ${metrics.runs_executed} (${metrics.runs_completed} complétés, ${metrics.runs_failed} échoués)
- Coût LLM : $${metrics.llm_cost.toFixed(2)}
- Temps économisé estimé : ${Math.round(metrics.time_saved_minutes / 60 * 10) / 10}h`,
          },
        ],
        max_tokens: 400,
        temperature: 0.6,
      }),
    });

    if (aiResp.ok) {
      const aiData = await aiResp.json();
      insights = aiData.choices?.[0]?.message?.content ?? "";
    }
  } catch (e) {
    console.error("[generate-weekly-report] AI insights error:", e);
  }

  // 7. Upsert report
  const { error } = await sb.from("weekly_reports").upsert(
    {
      org_id: orgId,
      week_start: wStartDate,
      metrics,
      insights: insights || null,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,week_start" },
  );

  if (error) throw new Error(`Failed to save report: ${error.message}`);

  return { org_id: orgId, week_start: wStartDate, metrics, has_insights: !!insights };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org_id, week_start, generate_all } = await req.json();
    const sb = getServiceClient();

    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "__none__");

    if (!isServiceRole) {
      // Validate user JWT
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace("Bearer ", "");
      const { error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (generate_all) {
      // Generate for all active orgs (used by cron)
      const { data: orgs } = await sb.from("orgs").select("id");
      const results = [];
      const now = new Date();
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      const ws = monday.toISOString().slice(0, 10);

      for (const org of orgs ?? []) {
        try {
          const r = await generateWeeklyReport(sb, org.id, ws);
          results.push(r);
        } catch (e: any) {
          results.push({ org_id: org.id, error: e.message });
        }
      }
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!org_id || !week_start) {
      return new Response(JSON.stringify({ error: "org_id and week_start required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await generateWeeklyReport(sb, org_id, week_start);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[generate-weekly-report] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
