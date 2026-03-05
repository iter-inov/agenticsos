
-- Contacts table for lead detection
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  source VARCHAR(50) NOT NULL DEFAULT 'email',
  status VARCHAR(50) NOT NULL DEFAULT 'lead',
  notes TEXT,
  first_contact TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view contacts"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can manage contacts"
  ON public.contacts FOR ALL
  TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role]));
