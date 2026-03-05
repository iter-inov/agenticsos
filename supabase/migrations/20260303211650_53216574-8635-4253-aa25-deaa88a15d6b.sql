
CREATE TABLE public.mcp_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request_payload jsonb DEFAULT '{}'::jsonb,
  response_preview jsonb DEFAULT '{}'::jsonb,
  duration_ms integer,
  error_message text,
  tested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view test results"
  ON public.mcp_test_results
  FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can manage test results"
  ON public.mcp_test_results
  FOR ALL
  TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));
