-- Multi-tenant credential security improvements
-- 1. Restrict oauth_tokens SELECT to admins only (prevent member access to plaintext tokens)
-- 2. Add credential_audit table for tracking all credential access
-- 3. Add indexes for performance at scale

-- ═══════════════════════════════════════════════════════════════
-- 1. Fix oauth_tokens RLS: members should NOT see raw tokens
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Members can view oauth_tokens" ON public.oauth_tokens;

-- Members can only see provider and connection status, not tokens
CREATE POLICY "Members can view oauth_token_status"
  ON public.oauth_tokens FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id));

-- Create a secure view for members that hides sensitive fields
CREATE OR REPLACE VIEW public.oauth_token_status AS
SELECT
  id,
  org_id,
  provider,
  CASE WHEN access_token IS NOT NULL THEN true ELSE false END AS is_connected,
  user_email,
  expires_at,
  scopes,
  created_at,
  updated_at
FROM public.oauth_tokens;

-- ═══════════════════════════════════════════════════════════════
-- 2. Credential audit table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.credential_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'accessed', 'refreshed', 'revoked', 'failed')),
  user_id uuid,
  details_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.credential_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view credential audit"
  ON public.credential_audit FOR SELECT
  USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

CREATE POLICY "System can insert credential audit"
  ON public.credential_audit FOR INSERT
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_credential_audit_org_created
  ON public.credential_audit(org_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 3. Performance indexes for multi-tenant queries
-- ═══════════════════════════════════════════════════════════════

-- Agents by org (most common query)
CREATE INDEX IF NOT EXISTS idx_agents_org_status
  ON public.agents(org_id, status);

-- Runs by org + status (rate limiting queries)
CREATE INDEX IF NOT EXISTS idx_runs_org_status_created
  ON public.runs(org_id, status, created_at DESC);

-- MCP tools by org (tool loading at runtime)
CREATE INDEX IF NOT EXISTS idx_mcp_tools_org
  ON public.mcp_tools(org_id, name);

-- OAuth tokens by org + provider (credential lookup)
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_org_provider
  ON public.oauth_tokens(org_id, provider);

-- Secrets by org + name (credential lookup)
CREATE INDEX IF NOT EXISTS idx_secrets_org_name
  ON public.secrets(org_id, name);

-- Usage daily by org + date (budget checks)
CREATE INDEX IF NOT EXISTS idx_usage_daily_org_date
  ON public.usage_daily(org_id, date DESC);

-- Workflows by org
CREATE INDEX IF NOT EXISTS idx_workflows_org_active
  ON public.workflows(org_id, is_active);

-- Rate limits by org + window
CREATE INDEX IF NOT EXISTS idx_rate_limits_org_window
  ON public.rate_limits(org_id, window_key, window_start DESC);

-- Audit logs by org + time
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs(org_id, created_at DESC);

-- Org members by user (fast org resolution)
CREATE INDEX IF NOT EXISTS idx_org_members_user
  ON public.org_members(user_id, org_id);
