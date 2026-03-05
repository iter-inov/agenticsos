
CREATE TABLE public.social_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'instagram',
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  external_post_id TEXT,
  engagement_json JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view social posts" ON public.social_posts
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can manage social posts" ON public.social_posts
  FOR ALL TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY(ARRAY['owner'::org_role, 'admin'::org_role]));
