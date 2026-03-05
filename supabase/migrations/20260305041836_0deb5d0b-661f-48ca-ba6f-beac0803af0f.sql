
CREATE TABLE public.email_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) NOT NULL,
  gmail_message_id VARCHAR(100) UNIQUE,
  thread_id VARCHAR(100),
  from_email VARCHAR(255),
  from_name VARCHAR(255),
  subject TEXT,
  body_preview TEXT,
  received_at TIMESTAMPTZ,
  ai_label VARCHAR(20),
  ai_summary TEXT,
  ai_reply TEXT,
  ai_priority INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'unread',
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view inbox emails"
  ON public.email_inbox FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can manage inbox emails"
  ON public.email_inbox FOR ALL
  TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role]));
