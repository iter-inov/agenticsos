
-- Fix 1A: Add mcp_tool_id column to agent_tools referencing mcp_tools
ALTER TABLE public.agent_tools
ADD COLUMN IF NOT EXISTS mcp_tool_id UUID REFERENCES public.mcp_tools(id);

-- Add unique constraint on (agent_id, mcp_tool_id) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS agent_tools_agent_mcp_tool_unique
ON public.agent_tools (agent_id, mcp_tool_id)
WHERE mcp_tool_id IS NOT NULL;
