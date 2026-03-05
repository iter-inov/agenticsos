CREATE TABLE public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) NOT NULL,
  week_start DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  insights TEXT,
  generated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, week_start)
);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view weekly reports"
  ON public.weekly_reports FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can manage weekly reports"
  ON public.weekly_reports FOR ALL
  USING (get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['owner'::org_role, 'admin'::org_role]));