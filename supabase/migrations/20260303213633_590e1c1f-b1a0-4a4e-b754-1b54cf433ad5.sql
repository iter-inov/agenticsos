
CREATE TABLE public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz,
  scopes text[],
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage oauth_tokens"
  ON public.oauth_tokens FOR ALL
  TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

CREATE POLICY "Members can view oauth_tokens"
  ON public.oauth_tokens FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE TRIGGER update_oauth_tokens_updated_at
  BEFORE UPDATE ON public.oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
