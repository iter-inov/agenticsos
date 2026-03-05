import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  resolveTenantContext,
} from "../_shared/auth.ts";
import { CredentialManager } from "../_shared/credentials.ts";
import { TenantQuery } from "../_shared/tenant-query.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";

const SLACK_GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

// ── PII / Secret redaction for logging ──
function redactForLog(input: unknown): unknown {
  if (typeof input === "string") {
    return input
      .replace(/(?:sk|pk|rk|xoxb|xoxp|Bearer\s+)[A-Za-z0-9\-_\.]{10,}/gi, "[REDACTED]")
      .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[REDACTED]");
  }
  if (Array.isArray(input)) return input.map(redactForLog);
  if (input && typeof input === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (lk.includes("token") || lk.includes("secret") || lk.includes("password") || lk.includes("key") || lk.includes("credential")) {
        obj[k] = "[REDACTED]";
      } else {
        obj[k] = redactForLog(v);
      }
    }
    return obj;
  }
  return input;
}

// ────── Email body extraction helper ──────
function findTextPart(part: any): string | null {
  if (part.mimeType === "text/plain" && part.body?.data) return part.body.data;
  if (part.parts) {
    for (const p of part.parts) {
      const found = findTextPart(p);
      if (found) return found;
    }
  }
  return null;
}

// ────── Tool handlers ──────
// Now use CredentialManager (creds) + TenantQuery (tq) instead of raw sb + orgId
type ToolHandler = (args: any, creds: CredentialManager, tq: TenantQuery) => Promise<any>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  slack_list_channels: async (args, creds) => {
    const env = creds.getEnvCredentials();
    const resp = await fetch(`${SLACK_GATEWAY_URL}/conversations.list?limit=${args.limit ?? 10}&exclude_archived=true`, {
      headers: {
        Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": env.SLACK_API_KEY,
      },
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(`Slack: ${data.error ?? "Unknown error"}`);
    return {
      channels: (data.channels ?? []).slice(0, args.limit ?? 10).map((c: any) => ({
        id: c.id, name: c.name, num_members: c.num_members,
      })),
    };
  },

  slack_send_message: async (args, creds) => {
    const env = creds.getEnvCredentials();
    let channelId = args.channel;
    if (channelId && !channelId.startsWith("C")) {
      const listResp = await fetch(`${SLACK_GATEWAY_URL}/conversations.list?limit=200&exclude_archived=true`, {
        headers: { Authorization: `Bearer ${env.LOVABLE_API_KEY}`, "X-Connection-Api-Key": env.SLACK_API_KEY },
      });
      const listData = await listResp.json();
      const found = (listData.channels ?? []).find((c: any) => c.name === channelId || c.name === channelId.replace("#", ""));
      if (found) channelId = found.id;
      else throw new Error(`Channel "${args.channel}" not found`);
    }
    const resp = await fetch(`${SLACK_GATEWAY_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": env.SLACK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: channelId, text: args.text ?? "Hello from Agent", username: "Agent Bot" }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(`Slack: ${data.error ?? "Unknown error"}`);
    return { sent: true, channel: data.channel, ts: data.ts };
  },

  gmail_read_inbox: async (args, creds) => {
    const accessToken = await creds.getGoogleAccessToken();
    if (!accessToken) throw new Error("Google OAuth not connected");

    const limit = args.limit ?? 5;
    const query = args.query ? `&q=${encodeURIComponent(args.query)}` : "";
    const listResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listResp.json();
    if (!listResp.ok) throw new Error("Gmail API error");

    const messages = [];
    for (const msg of (listData.messages ?? []).slice(0, limit)) {
      const d = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const detail = await d.json();
      const headers = detail.payload?.headers ?? [];
      messages.push({
        id: msg.id,
        subject: headers.find((h: any) => h.name === "Subject")?.value ?? "(no subject)",
        from: headers.find((h: any) => h.name === "From")?.value ?? "",
        date: headers.find((h: any) => h.name === "Date")?.value ?? "",
      });
    }
    return { messages, total: listData.resultSizeEstimate ?? messages.length };
  },

  gdrive_search: async (args, creds) => {
    const accessToken = await creds.getGoogleAccessToken();
    if (!accessToken) throw new Error("Google OAuth not connected");

    const query = args.query ? `&q=name contains '${args.query}'` : "";
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?pageSize=${args.limit ?? 5}&fields=files(id,name,mimeType,modifiedTime)${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error("Drive API error");
    return { files: data.files ?? [] };
  },

  calendar_list_events: async (args, creds) => {
    const accessToken = await creds.getGoogleAccessToken();
    if (!accessToken) throw new Error("Google OAuth not connected");

    const now = new Date().toISOString();
    const maxDate = new Date(Date.now() + (args.days_ahead ?? 7) * 86400000).toISOString();
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${args.limit ?? 5}&timeMin=${now}&timeMax=${maxDate}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error("Calendar API error");
    return {
      events: (data.items ?? []).map((e: any) => ({
        id: e.id,
        title: e.summary ?? "(no title)",
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
      })),
    };
  },

  // ────── WhatsApp handlers ──────
  whatsapp_send_message: async (args, creds) => {
    const token = await creds.getApiKey("whatsapp_access_token");
    const phoneId = await creds.getApiKey("whatsapp_phone_number_id");
    if (!token || !phoneId) throw new Error("WhatsApp credentials not configured");

    const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: args.to,
        type: "text",
        text: { body: args.message },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error("WhatsApp API error");
    return { message_id: data.messages?.[0]?.id, status: "sent" };
  },

  whatsapp_send_template: async (args, creds) => {
    const token = await creds.getApiKey("whatsapp_access_token");
    const phoneId = await creds.getApiKey("whatsapp_phone_number_id");
    if (!token || !phoneId) throw new Error("WhatsApp credentials not configured");

    const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: args.to,
        type: "template",
        template: { name: args.template_name, language: { code: args.language_code ?? "en_US" } },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error("WhatsApp API error");
    return { message_id: data.messages?.[0]?.id, status: "sent" };
  },

  // ────── Telegram handlers ──────
  telegram_send_message: async (args, creds) => {
    const token = await creds.getApiKey("telegram_bot_token");
    if (!token) throw new Error("Telegram bot token not configured");

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chat_id,
        text: args.text,
        parse_mode: args.parse_mode ?? "HTML",
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error("Telegram API error");
    return { message_id: data.result?.message_id, status: "sent" };
  },

  telegram_send_photo: async (args, creds) => {
    const token = await creds.getApiKey("telegram_bot_token");
    if (!token) throw new Error("Telegram bot token not configured");

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chat_id,
        photo: args.photo_url,
        caption: args.caption ?? "",
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error("Telegram API error");
    return { message_id: data.result?.message_id, status: "sent" };
  },

  telegram_get_updates: async (args, creds) => {
    const token = await creds.getApiKey("telegram_bot_token");
    if (!token) throw new Error("Telegram bot token not configured");

    const limit = args.limit ?? 10;
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=${limit}&timeout=0`);
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error("Telegram API error");
    return {
      updates: (data.result ?? []).map((u: any) => ({
        update_id: u.update_id,
        message: u.message ? {
          message_id: u.message.message_id,
          from: u.message.from?.username ?? u.message.from?.first_name,
          text: u.message.text,
          date: u.message.date,
        } : null,
      })),
    };
  },

  // ────── X (Twitter) handlers ──────
  x_get_me: async (_args, creds) => {
    const bearerToken = await creds.getApiKey("x_bearer_token");
    if (!bearerToken) throw new Error("X Bearer Token not configured");

    const resp = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error("X API error");
    return { id: data.data?.id, username: data.data?.username, name: data.data?.name };
  },

  x_post_tweet: async (args, creds) => {
    const consumerKey = await creds.getApiKey("x_consumer_key");
    const consumerSecret = await creds.getApiKey("x_consumer_secret");
    const accessToken = await creds.getApiKey("x_access_token");
    const accessTokenSecret = await creds.getApiKey("x_access_token_secret");
    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
      throw new Error("X API credentials not fully configured");
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const method = "POST";
    const url = "https://api.x.com/2/tweets";

    const params: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: timestamp,
      oauth_token: accessToken,
      oauth_version: "1.0",
    };

    const paramString = Object.keys(params).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
    const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(signingKey), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(baseString));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

    const authHeader = `OAuth oauth_consumer_key="${encodeURIComponent(consumerKey)}", oauth_nonce="${encodeURIComponent(nonce)}", oauth_signature="${encodeURIComponent(signature)}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${timestamp}", oauth_token="${encodeURIComponent(accessToken)}", oauth_version="1.0"`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ text: args.text }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error("X API error");
    return { tweet_id: data.data?.id, text: data.data?.text };
  },

  x_search_tweets: async (args, creds) => {
    const bearerToken = await creds.getApiKey("x_bearer_token");
    if (!bearerToken) throw new Error("X Bearer Token not configured");

    const query = encodeURIComponent(args.query ?? "");
    const limit = args.limit ?? 10;
    const resp = await fetch(`https://api.x.com/2/tweets/search/recent?query=${query}&max_results=${Math.min(limit, 100)}&tweet.fields=created_at,public_metrics`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error("X API error");
    return {
      tweets: (data.data ?? []).map((t: any) => ({
        id: t.id, text: t.text, created_at: t.created_at, metrics: t.public_metrics,
      })),
    };
  },

  // ────── Instagram handlers ──────
  instagram_get_profile: async (_args, creds) => {
    const token = await creds.getApiKey("instagram_access_token");
    const accountId = await creds.getApiKey("instagram_account_id");
    if (!token || !accountId) throw new Error("Instagram credentials not configured");

    const resp = await fetch(`https://graph.facebook.com/v18.0/${accountId}?fields=username,followers_count,media_count&access_token=${token}`);
    const data = await resp.json();
    if (data.error) throw new Error("Instagram API error");
    return data;
  },

  instagram_get_media: async (args, creds) => {
    const token = await creds.getApiKey("instagram_access_token");
    const accountId = await creds.getApiKey("instagram_account_id");
    if (!token || !accountId) throw new Error("Instagram credentials not configured");

    const limit = args.limit ?? 10;
    const resp = await fetch(`https://graph.facebook.com/v18.0/${accountId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count&limit=${limit}&access_token=${token}`);
    const data = await resp.json();
    if (data.error) throw new Error("Instagram API error");
    return { media: data.data ?? [] };
  },

  // ────── Facebook handlers ──────
  facebook_post: async (args, creds) => {
    const token = await creds.getApiKey("facebook_page_token");
    const pageId = await creds.getApiKey("facebook_page_id");
    if (!token || !pageId) throw new Error("Facebook credentials not configured");

    const resp = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: args.message, access_token: token }),
    });
    const data = await resp.json();
    if (data.error) throw new Error("Facebook API error");
    return { post_id: data.id, status: "published" };
  },

  facebook_get_posts: async (args, creds) => {
    const token = await creds.getApiKey("facebook_page_token");
    const pageId = await creds.getApiKey("facebook_page_id");
    if (!token || !pageId) throw new Error("Facebook credentials not configured");

    const limit = args.limit ?? 10;
    const resp = await fetch(`https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,created_time,likes.summary(true),comments.summary(true)&limit=${limit}&access_token=${token}`);
    const data = await resp.json();
    if (data.error) throw new Error("Facebook API error");
    return { posts: data.data ?? [] };
  },

  // ────── Workflow Builder tools ──────
  create_workflow: async (args, _creds, tq) => {
    const { name, trigger_type, cron_expr, agent_id, trigger_prompt, steps } = args;
    if (!name || !trigger_type || !agent_id) throw new Error("name, trigger_type, agent_id required");

    const { data: workflow, error } = await tq.insert("workflows", {
      name,
      trigger_type,
      trigger_config_json: {
        cron_expr: cron_expr || null,
        trigger_prompt: trigger_prompt || null,
        ...(args.trigger_config || {}),
      },
      agent_id,
      is_active: true,
    });

    if (error || !workflow) throw new Error(`Failed to create workflow: ${error?.message}`);

    if (steps?.length) {
      for (let i = 0; i < steps.length; i++) {
        await tq.raw.from("workflow_steps").insert({
          workflow_id: workflow.id,
          action_type: steps[i].action_type,
          action_config_json: steps[i].config || {},
          step_order: i + 1,
        });
      }
    }

    if (trigger_type === "cron" && cron_expr) {
      const nextRun = getNextCronDate(cron_expr);
      await tq.raw.from("scheduled_runs").insert({
        workflow_id: workflow.id,
        status: "pending",
        next_run_at: nextRun.toISOString(),
      });
    }

    return {
      workflow_id: workflow.id,
      name: workflow.name,
      status: "created",
      next_run: trigger_type === "cron" && cron_expr ? getNextCronDate(cron_expr).toISOString() : null,
    };
  },

  update_workflow: async (args, _creds, tq) => {
    const { workflow_id, changes } = args;
    if (!workflow_id || !changes) throw new Error("workflow_id and changes required");

    const allowedFields = ["name", "trigger_type", "trigger_config_json", "agent_id", "is_active", "description"];
    const safeChanges: Record<string, any> = {};
    for (const k of Object.keys(changes)) {
      if (allowedFields.includes(k)) safeChanges[k] = changes[k];
    }

    const { error } = await tq.update("workflows", safeChanges, { id: workflow_id });
    if (error) throw new Error(`Failed to update workflow: ${error.message}`);

    if (changes.trigger_config_json?.cron_expr) {
      const nextRun = getNextCronDate(changes.trigger_config_json.cron_expr);
      await tq.raw.from("scheduled_runs")
        .update({ next_run_at: nextRun.toISOString(), status: "pending" })
        .eq("workflow_id", workflow_id);
    }

    return { workflow_id, updated: Object.keys(safeChanges) };
  },

  activate_workflow: async (args, _creds, tq) => {
    const { workflow_id, active } = args;
    if (!workflow_id) throw new Error("workflow_id required");
    const isActive = active !== false;

    const { error } = await tq.update("workflows", { is_active: isActive }, { id: workflow_id });
    if (error) throw new Error(`Failed to toggle workflow: ${error.message}`);

    if (isActive) {
      const { data: wf } = await tq.selectOne("workflows", "trigger_type, trigger_config_json", { id: workflow_id });
      if (wf?.trigger_type === "cron" && wf.trigger_config_json?.cron_expr) {
        const { data: existing } = await tq.raw.from("scheduled_runs").select("id").eq("workflow_id", workflow_id).limit(1).single();
        if (!existing) {
          await tq.raw.from("scheduled_runs").insert({
            workflow_id,
            status: "pending",
            next_run_at: getNextCronDate(wf.trigger_config_json.cron_expr).toISOString(),
          });
        } else {
          await tq.raw.from("scheduled_runs").update({
            status: "pending",
            next_run_at: getNextCronDate(wf.trigger_config_json.cron_expr).toISOString(),
          }).eq("id", existing.id);
        }
      }
    }

    return { workflow_id, is_active: isActive };
  },

  run_workflow_now: async (args, _creds, tq) => {
    const { workflow_id } = args;
    if (!workflow_id) throw new Error("workflow_id required");

    const { data: wf } = await tq.selectOne("workflows", "*", { id: workflow_id });
    if (!wf) throw new Error("Workflow not found");

    const { data: run, error } = await tq.insert("runs", {
      agent_id: wf.agent_id,
      source: "manual",
      status: "pending",
    });
    if (error) throw new Error(`Failed to create run: ${error.message}`);
    return { run_id: run.id, workflow_id, status: "triggered" };
  },

  list_workflows: async (args, _creds, tq) => {
    const { data } = await tq.select(
      "workflows",
      "id, name, trigger_type, trigger_config_json, is_active, agent_id, created_at",
      undefined,
      { limit: args.limit ?? 20, order: { column: "created_at", ascending: false } },
    );
    return { workflows: data ?? [] };
  },

  list_agents: async (args, _creds, tq) => {
    const { data } = await tq.select(
      "agents",
      "id, name, status, default_model_id, created_at",
      { status: "active" },
      { limit: args.limit ?? 50, order: { column: "name" } },
    );
    return { agents: data ?? [] };
  },

  list_connected_tools: async (_args, _creds, tq) => {
    const { data: connections } = await tq.select(
      "tool_connections",
      "status, tools(slug, name, category)",
      { status: "connected" },
    );
    const { data: mcpTools } = await tq.select(
      "mcp_tools",
      "id, name, description, risk_level",
    );
    return {
      connected_tools: (connections ?? []).map((c: any) => c.tools),
      mcp_tools: mcpTools ?? [],
    };
  },

  // ────── Social Media Autopilot tools ──────
  create_post_draft: async (args, _creds, tq) => {
    const { platform, content, hashtags, image_description, scheduled_at } = args;
    if (!platform || !content) throw new Error("platform and content are required");

    const { data, error } = await tq.insert("social_posts", {
      platform,
      content,
      hashtags: hashtags || [],
      image_description: image_description || null,
      status: scheduled_at ? "scheduled" : "draft",
      scheduled_at: scheduled_at || null,
      created_by_agent: true,
    });
    if (error) throw new Error(`Failed to create post draft: ${error.message}`);
    return { post_id: data.id, platform, status: data.status, created: true };
  },

  publish_post: async (args, creds, tq) => {
    const { post_id, immediate } = args;
    if (!post_id) throw new Error("post_id is required");

    const { data: post } = await tq.selectOne("social_posts", "*", { id: post_id });
    if (!post) throw new Error("Post not found");

    if (post.platform === "instagram") {
      const token = await creds.getApiKey("instagram_access_token");
      const accountId = await creds.getApiKey("instagram_account_id");
      if (!token || !accountId) throw new Error("Instagram credentials not configured");

      const caption = post.content + (post.hashtags?.length ? "\n\n" + post.hashtags.join(" ") : "");
      const containerResp = await fetch(
        `https://graph.facebook.com/v18.0/${accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption,
            image_url: post.image_url || "https://placehold.co/1080x1080/png?text=Post",
            access_token: token,
          }),
        }
      );
      const container = await containerResp.json();
      if (container.error) throw new Error(`IG container error: ${container.error.message}`);

      const pubResp = await fetch(
        `https://graph.facebook.com/v18.0/${accountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: container.id, access_token: token }),
        }
      );
      const published = await pubResp.json();
      if (published.error) throw new Error(`IG publish error: ${published.error.message}`);

      await tq.update("social_posts", {
        status: "published",
        published_at: new Date().toISOString(),
        external_post_id: published.id,
      }, { id: post_id });

      return { post_id: published.id, platform: "instagram", status: "published" };
    }

    if (post.platform === "facebook") {
      const token = await creds.getApiKey("facebook_page_token");
      const pageId = await creds.getApiKey("facebook_page_id");
      if (!token || !pageId) throw new Error("Facebook credentials not configured");

      const resp = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: post.content, access_token: token }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(`FB error: ${result.error.message}`);

      await tq.update("social_posts", {
        status: "published",
        published_at: new Date().toISOString(),
        external_post_id: result.id,
      }, { id: post_id });

      return { post_id: result.id, platform: "facebook", status: "published" };
    }

    throw new Error(`Unsupported platform: ${post.platform}`);
  },

  get_social_stats: async (args, _creds, tq) => {
    const { platform, period } = args;
    let dateFilter = new Date();
    if (period === "week") dateFilter = new Date(Date.now() - 7 * 86400000);
    else if (period === "month") dateFilter = new Date(Date.now() - 30 * 86400000);
    else dateFilter = new Date(new Date().setHours(0, 0, 0, 0));

    let query = tq.raw.from("social_posts").select("*").eq("org_id", tq.tenantOrgId).gte("created_at", dateFilter.toISOString());
    if (platform && platform !== "all") query = query.eq("platform", platform);

    const { data: posts } = await query;
    const p = posts ?? [];
    return {
      total_posts: p.length,
      published: p.filter((x: any) => x.status === "published").length,
      drafts: p.filter((x: any) => x.status === "draft").length,
      scheduled: p.filter((x: any) => x.status === "scheduled" || x.status === "approved").length,
      engagement: p.reduce((acc: any, x: any) => {
        const e = x.engagement_json || {};
        return {
          likes: (acc.likes || 0) + (e.likes || 0),
          comments: (acc.comments || 0) + (e.comments || 0),
          reach: (acc.reach || 0) + (e.reach || 0),
        };
      }, { likes: 0, comments: 0, reach: 0 }),
    };
  },

  // ────── Inbox / Gmail sync tools ──────
  sync_inbox: async (args, creds, tq) => {
    const accessToken = await creds.getGoogleAccessToken();
    if (!accessToken) throw new Error("Google OAuth not connected");

    const query = args.query || "is:unread newer_than:1d";
    const limit = args.limit ?? 20;

    const listResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listData = await listResp.json();
    if (!listResp.ok) throw new Error("Gmail API error listing messages");

    const msgList = listData.messages ?? [];
    let synced = 0;

    for (const msg of msgList) {
      const d = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const detail = await d.json();
      if (!d.ok) continue;

      const headers = detail.payload?.headers ?? [];
      const fromRaw = headers.find((h: any) => h.name === "From")?.value ?? "";
      const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "(no subject)";

      const emailMatch = fromRaw.match(/<([^>]+)>/);
      const fromEmail = emailMatch ? emailMatch[1] : fromRaw.replace(/"/g, "").trim();
      const fromName = fromRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || fromEmail;

      let bodyPreview = detail.snippet ?? "";
      if (!bodyPreview && detail.payload) {
        const textPart = findTextPart(detail.payload);
        if (textPart) {
          const decoded = atob(textPart.replace(/-/g, "+").replace(/_/g, "/"));
          bodyPreview = decoded.slice(0, 500);
        }
      }

      const receivedAt = detail.internalDate
        ? new Date(parseInt(detail.internalDate)).toISOString()
        : new Date().toISOString();

      await tq.upsert("email_inbox", {
        gmail_message_id: msg.id,
        thread_id: detail.threadId ?? null,
        from_email: fromEmail,
        from_name: fromName,
        subject,
        body_preview: bodyPreview.slice(0, 500),
        received_at: receivedAt,
      }, "gmail_message_id");
      synced++;
    }

    return { synced, total_found: msgList.length };
  },

  analyze_email: async (args, _creds, tq) => {
    const { email_id } = args;
    if (!email_id) throw new Error("email_id required");

    const { data: email } = await tq.selectOne("email_inbox", "*", { id: email_id });
    if (!email) throw new Error("Email not found");

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
            content: `Tu analyses des emails professionnels. Pour chaque email, tu retournes un JSON :
{
  "label": "urgent|action|fyi|spam|lead",
  "priority": 1-5,
  "summary": "résumé en 1-2 phrases max",
  "suggested_reply": "réponse professionnelle en français si nécessaire, null si FYI/spam"
}
Réponds UNIQUEMENT avec le JSON, rien d'autre.`,
          },
          {
            role: "user",
            content: `De : ${email.from_name} <${email.from_email}>\nSujet : ${email.subject}\nDate : ${email.received_at}\nContenu : ${email.body_preview}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!aiResp.ok) throw new Error("AI analysis failed");
    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";

    let analysis = { label: "fyi", priority: 3, summary: "", suggested_reply: null as string | null };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
    } catch {}

    await tq.update("email_inbox", {
      ai_label: analysis.label,
      ai_priority: analysis.priority,
      ai_summary: analysis.summary,
      ai_reply: analysis.suggested_reply,
      status: "reviewed",
    }, { id: email_id });

    // Lead detection
    if (analysis.label === "lead" && email.from_email) {
      await tq.upsert("contacts", {
        email: email.from_email,
        name: email.from_name || email.from_email,
        source: "email",
        status: "lead",
        notes: analysis.summary,
        first_contact: email.received_at || new Date().toISOString(),
      }, "org_id,email");

      const env = new CredentialManager(tq.tenantOrgId).getEnvCredentials();
      if (env.LOVABLE_API_KEY && env.SLACK_API_KEY) {
        try {
          await fetch(`${SLACK_GATEWAY_URL}/chat.postMessage`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": env.SLACK_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: "general",
              text: `🔥 *Nouveau lead détecté* : ${email.from_name || email.from_email}\n📧 ${email.subject}\n📝 ${analysis.summary}`,
              username: "Lead Bot",
            }),
          });
        } catch { /* non-blocking */ }
      }
    }

    return { email_id, ...analysis };
  },

  suggest_reply: async (args, _creds, tq) => {
    const { email_id, context } = args;
    if (!email_id) throw new Error("email_id required");

    const { data: email } = await tq.selectOne("email_inbox", "*", { id: email_id });
    if (!email) throw new Error("Email not found");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu rédiges des réponses email professionnelles, concises et amicales en français. Donne UNIQUEMENT le texte de la réponse." },
          {
            role: "user",
            content: `Rédige une réponse à cet email :\nDe : ${email.from_name} <${email.from_email}>\nSujet : ${email.subject}\nContenu : ${email.body_preview}\n${context ? `Contexte additionnel : ${context}` : ""}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.5,
      }),
    });

    if (!aiResp.ok) throw new Error("AI reply generation failed");
    const aiData = await aiResp.json();
    const reply = aiData.choices?.[0]?.message?.content ?? "";

    await tq.update("email_inbox", { ai_reply: reply }, { id: email_id });
    return { email_id, reply };
  },

  send_reply: async (args, creds, tq) => {
    const { to, subject, body, thread_id, message_id } = args;
    if (!to || !body) throw new Error("to and body are required");

    const accessToken = await creds.getGoogleAccessToken();
    if (!accessToken) throw new Error("Google OAuth not connected");

    const messageParts = [
      `To: ${to}`,
      `Subject: Re: ${subject || ""}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    if (thread_id) messageParts.push(`In-Reply-To: ${thread_id}`);
    messageParts.push("", body);

    const rawMessage = messageParts.join("\n");
    const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sendBody: any = { raw: encoded };
    if (thread_id) sendBody.threadId = thread_id;

    const resp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(sendBody),
      },
    );

    const data = await resp.json();
    if (!resp.ok) throw new Error(`Gmail send error: ${JSON.stringify(data.error?.message || data)}`);

    if (message_id) {
      await tq.update("email_inbox", {
        status: "replied",
        replied_at: new Date().toISOString(),
      }, { gmail_message_id: message_id });
    }

    return { sent: true, gmail_id: data.id };
  },
};

// ── Cron helper ──
function getNextCronDate(expr: string): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return new Date(Date.now() + 3600_000);
  const [minP] = parts;
  if (expr === "* * * * *") return new Date(Date.now() + 60_000);
  if (minP.startsWith("*/")) {
    const interval = parseInt(minP.slice(2), 10) || 5;
    return new Date(Date.now() + interval * 60_000);
  }
  return new Date(Date.now() + 3600_000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tool_slug, action, args, run_id, debug } = body;

    if (!tool_slug) {
      return jsonResponse({ error: "tool_slug is required" }, 400);
    }

    // ── Unified auth ──
    const ctx = await resolveTenantContext(req, body);
    if (ctx instanceof Response) return ctx;

    // ── Rate limit ──
    const rl = await checkRateLimit(ctx.orgId, "tool_proxy");
    if (!rl.allowed) {
      return errorResponse("Rate limit exceeded", 429);
    }

    // ── Instantiate tenant-scoped services ──
    const creds = new CredentialManager(ctx.orgId);
    const tq = new TenantQuery(ctx);

    console.log(`[tool-proxy] tool=${tool_slug} org=${ctx.orgId} run=${run_id ?? "none"} user=${ctx.userId}`);

    // ── Find handler ──
    const handler = TOOL_HANDLERS[tool_slug];
    if (!handler) {
      return jsonResponse({
        ok: false,
        error: `Tool "${tool_slug}" not available`,
        data: null,
        _debug: debug ? { available_handlers: Object.keys(TOOL_HANDLERS) } : undefined,
      });
    }

    try {
      const result = await handler(args ?? {}, creds, tq);

      if (run_id) {
        await tq.raw.from("run_events").insert({
          run_id,
          type: "tool_call",
          payload_json: redactForLog({ tool: tool_slug, action, status: "success" }),
        });
      }

      return jsonResponse({
        ok: true,
        data: result,
        audit_meta: {
          tool_slug,
          action,
          run_id: run_id ?? null,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      console.error(`[tool-proxy] ${tool_slug} error:`, err.message);
      return jsonResponse({
        ok: false,
        error: debug ? err.message : "Tool execution failed",
        data: null,
      });
    }
  } catch (err: any) {
    console.error("[tool-proxy] Error:", err);
    return jsonResponse({ error: "Service error" }, 500);
  }
});
