
-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.agent_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE public.tool_type AS ENUM ('oauth', 'api_key', 'webhook');
CREATE TYPE public.connection_status AS ENUM ('connected', 'disconnected', 'error');
CREATE TYPE public.trigger_type AS ENUM ('manual', 'cron', 'webhook', 'event');
CREATE TYPE public.run_source AS ENUM ('chat', 'schedule', 'webhook', 'manual');
CREATE TYPE public.run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE public.run_event_type AS ENUM ('policy_check', 'llm_call', 'tool_call', 'log', 'error', 'approval_required', 'approval_granted');
CREATE TYPE public.security_mode AS ENUM ('low', 'medium', 'high');

-- =============================================
-- TABLES (no RLS policies yet)
-- =============================================

CREATE TABLE public.orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE TABLE public.models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  display_name TEXT,
  pricing_json JSONB DEFAULT '{}',
  caps_json JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, model_name)
);

CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_prompt TEXT,
  status public.agent_status NOT NULL DEFAULT 'active',
  default_model_id UUID REFERENCES public.models(id),
  config_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_model_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, model_id)
);

CREATE TABLE public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  type public.tool_type NOT NULL DEFAULT 'api_key',
  icon_url TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  permissions_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, tool_id)
);

CREATE TABLE public.tool_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  status public.connection_status NOT NULL DEFAULT 'disconnected',
  config_json JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, tool_id)
);

CREATE TABLE public.secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES public.tools(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type public.trigger_type NOT NULL DEFAULT 'manual',
  trigger_config_json JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  action_config_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.scheduled_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  next_run_at TIMESTAMPTZ NOT NULL,
  status public.run_status NOT NULL DEFAULT 'pending',
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,
  cost_estimate NUMERIC(10,6) DEFAULT 0,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source public.run_source NOT NULL DEFAULT 'chat',
  status public.run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_tokens INTEGER DEFAULT 0,
  total_cost NUMERIC(10,6) DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  type public.run_event_type NOT NULL,
  payload_json JSONB DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, date)
);

CREATE TABLE public.usage_by_agent_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tokens INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, agent_id, date)
);

CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  monthly_limit NUMERIC(10,2) DEFAULT 50.00,
  hard_stop BOOLEAN DEFAULT true,
  alert_thresholds JSONB DEFAULT '[50, 80, 95]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  mode public.security_mode NOT NULL DEFAULT 'medium',
  rules_json JSONB DEFAULT '{"pii_redaction": true, "require_approval_for_destructive": true, "max_tokens_per_run": 10000}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  required BOOLEAN DEFAULT true,
  reason TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- HELPER FUNCTIONS (tables exist now)
-- =============================================
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_role(_user_id uuid, _org_id uuid)
RETURNS public.org_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.org_members
  WHERE user_id = _user_id AND org_id = _org_id
  LIMIT 1;
$$;

-- =============================================
-- ENABLE RLS ON ALL TABLES
-- =============================================
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_model_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_by_agent_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- orgs
CREATE POLICY "Members can view their orgs" ON public.orgs FOR SELECT USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Owners/admins can update org" ON public.orgs FOR UPDATE USING (public.get_user_org_role(auth.uid(), id) IN ('owner', 'admin'));
CREATE POLICY "Authenticated users can create orgs" ON public.orgs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- org_members
CREATE POLICY "Members can view org members" ON public.org_members FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Owners can manage members" ON public.org_members FOR INSERT WITH CHECK (
  public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin') OR auth.uid() = user_id
);
CREATE POLICY "Owners can update members" ON public.org_members FOR UPDATE USING (public.get_user_org_role(auth.uid(), org_id) = 'owner');
CREATE POLICY "Owners can delete members" ON public.org_members FOR DELETE USING (public.get_user_org_role(auth.uid(), org_id) = 'owner');

-- models (global read)
CREATE POLICY "Anyone authenticated can read models" ON public.models FOR SELECT TO authenticated USING (true);

-- agents
CREATE POLICY "Members can view agents" ON public.agents FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can create agents" ON public.agents FOR INSERT WITH CHECK (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));
CREATE POLICY "Admins can update agents" ON public.agents FOR UPDATE USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));
CREATE POLICY "Admins can delete agents" ON public.agents FOR DELETE USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

-- agent_model_overrides
CREATE POLICY "Members can view overrides" ON public.agent_model_overrides FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND public.is_org_member(auth.uid(), a.org_id))
);
CREATE POLICY "Admins can manage overrides" ON public.agent_model_overrides FOR ALL USING (
  EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND public.get_user_org_role(auth.uid(), a.org_id) IN ('owner', 'admin'))
);

-- tools (global read)
CREATE POLICY "Anyone authenticated can read tools" ON public.tools FOR SELECT TO authenticated USING (true);

-- agent_tools
CREATE POLICY "Members can view agent tools" ON public.agent_tools FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND public.is_org_member(auth.uid(), a.org_id))
);
CREATE POLICY "Admins can manage agent tools" ON public.agent_tools FOR ALL USING (
  EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND public.get_user_org_role(auth.uid(), a.org_id) IN ('owner', 'admin'))
);

-- tool_connections
CREATE POLICY "Members can view connections" ON public.tool_connections FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage connections" ON public.tool_connections FOR ALL USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

-- secrets: NO policies = deny all client access

-- workflows
CREATE POLICY "Members can view workflows" ON public.workflows FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage workflows" ON public.workflows FOR ALL USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

-- workflow_steps
CREATE POLICY "Members can view steps" ON public.workflow_steps FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND public.is_org_member(auth.uid(), w.org_id))
);
CREATE POLICY "Admins can manage steps" ON public.workflow_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND public.get_user_org_role(auth.uid(), w.org_id) IN ('owner', 'admin'))
);

-- scheduled_runs
CREATE POLICY "Members can view scheduled runs" ON public.scheduled_runs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND public.is_org_member(auth.uid(), w.org_id))
);

-- conversations
CREATE POLICY "Members can view conversations" ON public.conversations FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can create conversations" ON public.conversations FOR INSERT WITH CHECK (public.is_org_member(auth.uid(), org_id) AND auth.uid() = user_id);

-- messages
CREATE POLICY "Members can view messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.is_org_member(auth.uid(), c.org_id))
);
CREATE POLICY "Members can insert messages" ON public.messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.is_org_member(auth.uid(), c.org_id))
);

-- runs
CREATE POLICY "Members can view runs" ON public.runs FOR SELECT USING (public.is_org_member(auth.uid(), org_id));

-- run_events
CREATE POLICY "Members can view run events" ON public.run_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.runs r WHERE r.id = run_id AND public.is_org_member(auth.uid(), r.org_id))
);

-- usage
CREATE POLICY "Members can view usage" ON public.usage_daily FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can view agent usage" ON public.usage_by_agent_daily FOR SELECT USING (public.is_org_member(auth.uid(), org_id));

-- budgets
CREATE POLICY "Members can view budgets" ON public.budgets FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage budgets" ON public.budgets FOR ALL USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

-- policies
CREATE POLICY "Members can view policies" ON public.policies FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage policies" ON public.policies FOR ALL USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

-- approvals
CREATE POLICY "Members can view approvals" ON public.approvals FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage approvals" ON public.approvals FOR UPDATE USING (public.get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin'));

-- =============================================
-- TRIGGERS (updated_at)
-- =============================================
CREATE TRIGGER update_orgs_updated_at BEFORE UPDATE ON public.orgs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON public.policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_secrets_updated_at BEFORE UPDATE ON public.secrets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUTO-CREATE ORG ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user_org()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.orgs (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s Workspace',
    NEW.id::text
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  INSERT INTO public.budgets (org_id) VALUES (new_org_id);
  INSERT INTO public.policies (org_id) VALUES (new_org_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_org();

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_agents_org_id ON public.agents(org_id);
CREATE INDEX idx_runs_org_id ON public.runs(org_id);
CREATE INDEX idx_runs_agent_id ON public.runs(agent_id);
CREATE INDEX idx_run_events_run_id ON public.run_events(run_id);
CREATE INDEX idx_run_events_created_at ON public.run_events(created_at DESC);
CREATE INDEX idx_workflows_org_id ON public.workflows(org_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_usage_daily_org_date ON public.usage_daily(org_id, date);

-- =============================================
-- REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.run_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
