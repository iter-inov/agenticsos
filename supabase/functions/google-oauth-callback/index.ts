import { getServiceClient } from "../_shared/auth.ts";
import { CredentialManager } from "../_shared/credentials.ts";
import { TenantQuery } from "../_shared/tenant-query.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  console.log("[google-oauth-callback] Params:", {
    code: code ? code.substring(0, 10) + "..." : null,
    state: stateParam ? stateParam.substring(0, 30) + "..." : null,
    error,
  });

  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const frontendUrl = origin ? new URL(origin).origin : "https://id-preview--e0c8eecf-ffa0-4693-977d-01a5a9ab9ddc.lovable.app";

  if (error) {
    const errorDesc = url.searchParams.get("error_description") || "auth_denied";
    console.error("[google-oauth-callback] OAuth error from Google:", { error, errorDesc });
    return Response.redirect(`${frontendUrl}/mcp-test?google_auth=error&message=${encodeURIComponent(errorDesc)}`, 302);
  }

  if (!code || !stateParam) {
    return Response.redirect(`${frontendUrl}/mcp-test?google_auth=error&message=missing_code`, 302);
  }

  try {
    const state = JSON.parse(atob(stateParam));
    const { org_id, user_id } = state;

    if (!org_id || !user_id) {
      return Response.redirect(`${frontendUrl}/mcp-test?google_auth=error&message=invalid_state`, 302);
    }

    const sb = getServiceClient();

    // Validate membership
    const { data: membership } = await sb
      .from("org_members")
      .select("id")
      .eq("user_id", user_id)
      .eq("org_id", org_id)
      .single();

    if (!membership) {
      console.error(`[google-oauth-callback] User ${user_id} is not a member of org ${org_id}`);
      return Response.redirect(`${frontendUrl}/mcp-test?google_auth=error&message=unauthorized`, 302);
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${SUPABASE_URL}/functions/v1/google-oauth-callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return Response.redirect(`${frontendUrl}/mcp-test?google_auth=error&message=config_error`, 302);
    }

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.access_token) {
      const googleError = tokenData.error_description || tokenData.error || "token_exchange_failed";
      console.error("[google-oauth-callback] Token exchange failed:", googleError);
      return Response.redirect(`${frontendUrl}/mcp-test?google_auth=error&message=${encodeURIComponent(googleError)}`, 302);
    }

    // Get user email
    let userEmail = "";
    try {
      const profileResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileResp.json();
      userEmail = profile.email ?? "";
    } catch (_) { /* Non-critical */ }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const scopes = tokenData.scope ? tokenData.scope.split(" ") : [];

    // Use CredentialManager to store the token
    const creds = new CredentialManager(org_id);
    await creds.upsertOAuthToken("google", {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt,
      scopes,
      userEmail,
    });

    // Compile Google tools
    await compileGoogleTools(sb, org_id);

    return Response.redirect(`${frontendUrl}/mcp-test?google_auth=success&email=${encodeURIComponent(userEmail)}`, 302);
  } catch (err: any) {
    console.error("[google-oauth-callback] Error:", err);
    return Response.redirect(`${frontendUrl}/mcp-test?google_auth=error&message=unexpected_error`, 302);
  }
});

async function compileGoogleTools(sb: any, orgId: string) {
  const tq = new TenantQuery(orgId);
  const serverLabel = "Google Workspace";
  const serverId = "google-workspace";

  const { data: existingServer } = await tq.selectOne("mcp_servers", "id", { server_id: serverId });

  let serverDbId: string;

  if (existingServer) {
    serverDbId = existingServer.id;
    await tq.delete("mcp_tools", { server_id: serverDbId });
  } else {
    const { data: newServer } = await tq.insert("mcp_servers", {
      server_id: serverId,
      label: serverLabel,
      type: "native",
    });
    serverDbId = newServer?.id;
  }

  if (!serverDbId) return;

  const googleTools = [
    { name: "gmail_read_inbox", description: "Read recent emails from Gmail inbox", risk_level: "low", requires_approval: false, input_schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } } },
    { name: "gmail_send_email", description: "Send an email via Gmail", risk_level: "high", requires_approval: true, input_schema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] } },
    { name: "gdrive_search", description: "Search files in Google Drive", risk_level: "low", requires_approval: false, input_schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
    { name: "calendar_list_events", description: "List upcoming Google Calendar events", risk_level: "low", requires_approval: false, input_schema: { type: "object", properties: { days_ahead: { type: "number" }, limit: { type: "number" } } } },
  ];

  for (const tool of googleTools) {
    await tq.insert("mcp_tools", { server_id: serverDbId, ...tool });
  }

  console.log(`[google-oauth-callback] Compiled ${googleTools.length} Google tools for org`);
}
