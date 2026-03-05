
-- Add missing columns to social_posts
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS hashtags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS image_description TEXT,
  ADD COLUMN IF NOT EXISTS created_by_agent BOOLEAN DEFAULT true;

-- Create social_stats table
CREATE TABLE public.social_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) NOT NULL,
  platform TEXT NOT NULL DEFAULT 'instagram',
  period_date DATE NOT NULL,
  posts_count INTEGER DEFAULT 0,
  total_reach INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  followers_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.social_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view social stats"
  ON public.social_stats FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can manage social stats"
  ON public.social_stats FOR ALL
  TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role]));
