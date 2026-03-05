import { useState, useEffect, useCallback } from "react";
import { Loader2, PanelRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { WorkflowChat } from "@/components/workflows/WorkflowChat";
import { WorkflowCanvas } from "@/components/workflows/WorkflowCanvas";
import { WorkflowCards } from "@/components/workflows/WorkflowCards";
import { Switch } from "@/components/ui/switch";

interface WorkflowWithAgent extends Tables<"workflows"> {
  agents: { name: string } | null;
}

export default function Workflows() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<WorkflowWithAgent[]>([]);
  const [scheduledRuns, setScheduledRuns] = useState<any[]>([]);
  const [steps, setSteps] = useState<Tables<"workflow_steps">[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowWithAgent | null>(null);
  const [injectedMessage, setInjectedMessage] = useState<string | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);

  const fetchData = useCallback(async (oid: string) => {
    const [{ data: wfs }, { data: srs }] = await Promise.all([
      supabase.from("workflows").select("*, agents(name)").eq("org_id", oid).order("created_at", { ascending: false }),
      supabase.from("scheduled_runs").select("*, workflows!inner(org_id)").eq("workflows.org_id", oid),
    ]);
    setWorkflows((wfs as WorkflowWithAgent[]) || []);
    setScheduledRuns(srs || []);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", user.id).limit(1).single();
      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);
      await fetchData(membership.org_id);
      setLoading(false);
    })();
  }, [user, fetchData]);

  // Load steps when a workflow is selected
  useEffect(() => {
    if (!selectedWorkflow) { setSteps([]); return; }
    supabase.from("workflow_steps").select("*").eq("workflow_id", selectedWorkflow.id)
      .order("step_order").then(({ data }) => setSteps(data || []));
  }, [selectedWorkflow]);

  const handleRunNow = async (wf: WorkflowWithAgent) => {
    if (!orgId) return;
    toast({ title: "Lancement du workflow..." });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Non authentifié");
      const triggerConfig = (wf.trigger_config_json as any) ?? {};
      const prompt = triggerConfig.trigger_prompt ?? triggerConfig.prompt ?? wf.description ?? `Execute workflow: ${wf.name}`;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agent_id: wf.agent_id ?? "default", prompt, org_id: orgId }),
      });
      if (!resp.ok) throw new Error(`Erreur ${resp.status}`);
      const reader = resp.body?.getReader();
      if (reader) { while (!(await reader.read()).done); }
      toast({ title: "✅ Workflow lancé" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleToggle = async (wf: WorkflowWithAgent) => {
    await supabase.from("workflows").update({ is_active: !wf.is_active }).eq("id", wf.id);
    if (orgId) await fetchData(orgId);
  };

  const handleDelete = async (wf: WorkflowWithAgent) => {
    await supabase.from("workflow_steps").delete().eq("workflow_id", wf.id);
    await supabase.from("scheduled_runs").delete().eq("workflow_id", wf.id);
    await supabase.from("workflows").delete().eq("id", wf.id);
    if (selectedWorkflow?.id === wf.id) setSelectedWorkflow(null);
    if (orgId) await fetchData(orgId);
    toast({ title: "Workflow supprimé" });
  };

  const handleEdit = (wf: WorkflowWithAgent) => {
    setInjectedMessage(`Je veux modifier le workflow "${wf.name}"`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const activeCount = workflows.filter(w => w.is_active).length;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-0">
      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Chat panel */}
        <div className={showCanvas ? "w-[380px] shrink-0 border-r border-border" : "flex-1"}>
          {orgId && (
            <WorkflowChat
              orgId={orgId}
              workflowCount={activeCount}
              onWorkflowChange={() => orgId && fetchData(orgId)}
              injectedMessage={injectedMessage}
              onInjectedConsumed={() => setInjectedMessage(null)}
            />
          )}
        </div>

        {/* Canvas (togglable) */}
        {showCanvas && (
          <div className="flex-1 bg-muted/30">
            <WorkflowCanvas workflow={selectedWorkflow} steps={steps} />
          </div>
        )}
      </div>

      {/* Bottom cards strip */}
      <div className="shrink-0 border-t border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Workflows ({workflows.length})
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <PanelRight className="h-3.5 w-3.5" />
            <span>Canvas</span>
            <Switch checked={showCanvas} onCheckedChange={setShowCanvas} />
          </div>
        </div>
        <WorkflowCards
          workflows={workflows}
          scheduledRuns={scheduledRuns}
          selectedId={selectedWorkflow?.id ?? null}
          onSelect={setSelectedWorkflow}
          onRunNow={handleRunNow}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
