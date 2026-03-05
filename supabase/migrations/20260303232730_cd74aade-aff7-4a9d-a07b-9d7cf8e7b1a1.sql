
-- 1. Add RLS policies to secrets table (currently has NONE - critical!)
ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage secrets"
ON public.secrets FOR ALL
TO authenticated
USING (
  get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin')
)
WITH CHECK (
  get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin')
);

-- 2. Create audit_logs table for rate limit tracking and security events
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  details_json jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin')
);

-- 3. Create rate_limits table for tracking
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE NOT NULL,
  window_key text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, window_key)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
