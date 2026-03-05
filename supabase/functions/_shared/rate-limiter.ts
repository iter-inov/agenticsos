import { getServiceClient } from "./auth.ts";

interface RateLimitConfig {
  key: string;
  maxRequests: number;
  windowMinutes: number;
}

interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  retryAfterSeconds: number;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  mcp_request: { key: "mcp_request", maxRequests: 100, windowMinutes: 60 },
  agent_run: { key: "agent_run", maxRequests: 100, windowMinutes: 60 },
  agent_concurrent: { key: "agent_concurrent", maxRequests: 10, windowMinutes: 1 },
  tool_proxy: { key: "tool_proxy", maxRequests: 200, windowMinutes: 60 },
};

/**
 * Check and increment rate limit for an org.
 */
export async function checkRateLimit(
  orgId: string,
  configKey: string,
  overrides?: Partial<RateLimitConfig>,
): Promise<RateLimitResult> {
  const config = { ...(DEFAULT_CONFIGS[configKey] ?? { key: configKey, maxRequests: 100, windowMinutes: 60 }), ...overrides };
  const sb = getServiceClient();
  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000).toISOString();

  const { data } = await sb
    .from("rate_limits")
    .select("id, count")
    .eq("org_id", orgId)
    .eq("window_key", config.key)
    .gte("window_start", windowStart)
    .maybeSingle();

  if (!data) {
    await sb.from("rate_limits").insert({
      org_id: orgId,
      window_key: config.key,
      count: 1,
    });
    return { allowed: true, current: 1, limit: config.maxRequests, retryAfterSeconds: 0 };
  }

  const newCount = data.count + 1;

  if (newCount > config.maxRequests) {
    await sb.from("audit_logs").insert({
      org_id: orgId,
      event_type: `rate_limit_${config.key}`,
      details_json: { count: newCount, limit: config.maxRequests, window_minutes: config.windowMinutes },
    });
    return {
      allowed: false,
      current: newCount,
      limit: config.maxRequests,
      retryAfterSeconds: config.windowMinutes * 60,
    };
  }

  await sb.from("rate_limits").update({ count: newCount }).eq("id", data.id);
  return { allowed: true, current: newCount, limit: config.maxRequests, retryAfterSeconds: 0 };
}
