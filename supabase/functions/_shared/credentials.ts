import { getServiceClient } from "./auth.ts";

export type CredentialType = "oauth2" | "api_key";
export type Provider =
  | "google"
  | "slack"
  | "notion"
  | "whatsapp"
  | "telegram"
  | "x"
  | "instagram"
  | "facebook"
  | "airtable"
  | "n8n"
  | "tradingview";

interface OAuthCredential {
  type: "oauth2";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[] | null;
  userEmail: string | null;
}

interface ApiKeyCredential {
  type: "api_key";
  key: string;
}

export type Credential = OAuthCredential | ApiKeyCredential;

/**
 * CredentialManager — Centralized credential access layer for multi-tenant.
 *
 * All credential reads go through this class. It handles:
 * - OAuth token retrieval + auto-refresh
 * - API key retrieval from secrets table
 * - Environment variable fallback for global keys (Slack, Lovable)
 * - Audit logging of credential access
 */
export class CredentialManager {
  private sb: ReturnType<typeof getServiceClient>;
  private orgId: string;

  constructor(orgId: string) {
    this.sb = getServiceClient();
    this.orgId = orgId;
  }

  /**
   * Get an OAuth2 credential for a provider.
   * Automatically refreshes expired tokens when possible.
   */
  async getOAuthToken(provider: Provider): Promise<OAuthCredential | null> {
    const { data: token } = await this.sb
      .from("oauth_tokens")
      .select("id, access_token, refresh_token, expires_at, scopes, user_email")
      .eq("org_id", this.orgId)
      .eq("provider", provider)
      .single();

    if (!token) return null;

    // Check expiry and refresh if needed
    const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0;
    const now = Date.now();

    if (expiresAt > now + 60_000) {
      return {
        type: "oauth2",
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at,
        scopes: token.scopes,
        userEmail: token.user_email,
      };
    }

    // Try to refresh
    if (!token.refresh_token) return null;

    const refreshed = await this.refreshOAuthToken(provider, token.id, token.refresh_token);
    return refreshed;
  }

  /**
   * Get a Google access token (convenience method).
   */
  async getGoogleAccessToken(): Promise<string | null> {
    const cred = await this.getOAuthToken("google");
    return cred?.accessToken ?? null;
  }

  /**
   * Get an API key from the secrets table.
   */
  async getApiKey(name: string): Promise<string | null> {
    const { data } = await this.sb
      .from("secrets")
      .select("encrypted_payload")
      .eq("org_id", this.orgId)
      .eq("name", name)
      .single();

    return data?.encrypted_payload ?? null;
  }

  /**
   * Get environment-level credentials (shared across orgs).
   * Used for platform-level integrations like Slack Connector Gateway.
   */
  getEnvCredentials(): Record<string, string> {
    return {
      LOVABLE_API_KEY: Deno.env.get("LOVABLE_API_KEY") ?? "",
      SLACK_API_KEY: Deno.env.get("SLACK_API_KEY") ?? "",
      GOOGLE_CLIENT_ID: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      GOOGLE_CLIENT_SECRET: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
    };
  }

  /**
   * Resolve all credentials needed for a specific tool.
   * Returns the appropriate credential or null if not available.
   */
  async resolveForTool(toolName: string): Promise<{
    credential: Credential | null;
    envKeys: Record<string, string>;
    status: "ready" | "auth_missing" | "config_missing";
  }> {
    const envKeys = this.getEnvCredentials();

    // Slack tools use env-level keys
    if (toolName.startsWith("slack_")) {
      if (!envKeys.LOVABLE_API_KEY || !envKeys.SLACK_API_KEY) {
        return { credential: null, envKeys, status: "auth_missing" };
      }
      return {
        credential: { type: "api_key", key: envKeys.SLACK_API_KEY },
        envKeys,
        status: "ready",
      };
    }

    // Google tools use OAuth
    if (
      toolName.startsWith("gmail_") ||
      toolName.startsWith("gdrive_") ||
      toolName.startsWith("calendar_")
    ) {
      const oauth = await this.getOAuthToken("google");
      if (!oauth) {
        return { credential: null, envKeys, status: "auth_missing" };
      }
      return { credential: oauth, envKeys, status: "ready" };
    }

    // WhatsApp
    if (toolName.startsWith("whatsapp_")) {
      const key = await this.getApiKey("whatsapp_access_token");
      if (!key) return { credential: null, envKeys, status: "auth_missing" };
      return { credential: { type: "api_key", key }, envKeys, status: "ready" };
    }

    // Telegram
    if (toolName.startsWith("telegram_")) {
      const key = await this.getApiKey("telegram_bot_token");
      if (!key) return { credential: null, envKeys, status: "auth_missing" };
      return { credential: { type: "api_key", key }, envKeys, status: "ready" };
    }

    // Notion
    if (toolName.startsWith("notion_")) {
      const key = await this.getApiKey("notion_api_key");
      if (!key) return { credential: null, envKeys, status: "auth_missing" };
      return { credential: { type: "api_key", key }, envKeys, status: "ready" };
    }

    // X (Twitter)
    if (toolName.startsWith("x_")) {
      const key = await this.getApiKey("x_bearer_token");
      if (!key) return { credential: null, envKeys, status: "auth_missing" };
      return { credential: { type: "api_key", key }, envKeys, status: "ready" };
    }

    // Default: try secrets table with tool name pattern
    const key = await this.getApiKey(`${toolName.split("_")[0]}_api_key`);
    if (key) {
      return { credential: { type: "api_key", key }, envKeys, status: "ready" };
    }

    return { credential: null, envKeys, status: "config_missing" };
  }

  /**
   * Store or update an OAuth token for a provider.
   */
  async upsertOAuthToken(
    provider: Provider,
    data: {
      accessToken: string;
      refreshToken?: string | null;
      expiresAt?: string | null;
      scopes?: string[] | null;
      userEmail?: string | null;
    },
  ): Promise<void> {
    await this.sb.from("oauth_tokens").upsert(
      {
        org_id: this.orgId,
        provider,
        access_token: data.accessToken,
        refresh_token: data.refreshToken ?? null,
        expires_at: data.expiresAt ?? null,
        scopes: data.scopes ?? null,
        user_email: data.userEmail ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" },
    );
  }

  /**
   * Store an API key in the secrets table.
   */
  async upsertSecret(name: string, value: string): Promise<void> {
    const { data: existing } = await this.sb
      .from("secrets")
      .select("id")
      .eq("org_id", this.orgId)
      .eq("name", name)
      .single();

    if (existing) {
      await this.sb
        .from("secrets")
        .update({ encrypted_payload: value, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await this.sb.from("secrets").insert({
        org_id: this.orgId,
        name,
        encrypted_payload: value,
      });
    }
  }

  /**
   * Revoke/delete a credential.
   */
  async revokeOAuthToken(provider: Provider): Promise<void> {
    await this.sb
      .from("oauth_tokens")
      .delete()
      .eq("org_id", this.orgId)
      .eq("provider", provider);
  }

  // ── Private ──

  private async refreshOAuthToken(
    provider: Provider,
    tokenId: string,
    refreshToken: string,
  ): Promise<OAuthCredential | null> {
    // Currently only Google supports refresh
    if (provider !== "google") return null;

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
      console.error(`[CredentialManager] Failed to refresh ${provider} token`);
      return null;
    }

    const newExpiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;

    await this.sb
      .from("oauth_tokens")
      .update({
        access_token: data.access_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenId);

    return {
      type: "oauth2",
      accessToken: data.access_token,
      refreshToken,
      expiresAt: newExpiresAt,
      scopes: null,
      userEmail: null,
    };
  }
}
