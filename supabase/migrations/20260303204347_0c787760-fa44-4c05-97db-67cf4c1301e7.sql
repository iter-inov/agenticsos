
-- MCP Configs: stores raw JSON per org
CREATE TABLE public.mcp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

-- MCP Servers: compiled from config
CREATE TABLE public.mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'native',
  base_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, server_id)
);

-- MCP Tools: compiled from config
CREATE TABLE public.mcp_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low',
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  input_schema JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

-- MCP Policies: compiled from config
CREATE TABLE public.mcp_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, policy_type)
);

-- RLS
ALTER TABLE public.mcp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_policies ENABLE ROW LEVEL SECURITY;

-- mcp_configs: admins manage, members view
CREATE POLICY "Admins can manage mcp_configs" ON public.mcp_configs FOR ALL TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));
CREATE POLICY "Members can view mcp_configs" ON public.mcp_configs FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- mcp_servers
CREATE POLICY "Admins can manage mcp_servers" ON public.mcp_servers FOR ALL TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));
CREATE POLICY "Members can view mcp_servers" ON public.mcp_servers FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- mcp_tools
CREATE POLICY "Admins can manage mcp_tools" ON public.mcp_tools FOR ALL TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));
CREATE POLICY "Members can view mcp_tools" ON public.mcp_tools FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- mcp_policies
CREATE POLICY "Admins can manage mcp_policies" ON public.mcp_policies FOR ALL TO authenticated
  USING (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'))
  WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));
CREATE POLICY "Members can view mcp_policies" ON public.mcp_policies FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- Triggers for updated_at
CREATE TRIGGER update_mcp_configs_updated_at BEFORE UPDATE ON public.mcp_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
