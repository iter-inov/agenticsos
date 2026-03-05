import { useMemo, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Bot, ArrowRight, Zap, Check, X } from "lucide-react";

interface WorkflowCanvasProps {
  workflow: (Tables<"workflows"> & { agents?: { name: string } | null }) | null;
  steps: Tables<"workflow_steps">[];
}

type NodeStatus = "idle" | "running" | "completed" | "error";

// ── Custom nodes ──

function TriggerNode({ data }: { data: any }) {
  const status: NodeStatus = data.status ?? "idle";
  const borderClass = status === "running" ? "animate-pulse border-primary"
    : status === "completed" ? "border-emerald-500"
    : status === "error" ? "border-destructive"
    : "border-primary/60";

  return (
    <div className={`rounded-xl border-2 ${borderClass} bg-card px-4 py-3 shadow-lg min-w-[180px] relative`}>
      {status === "completed" && <Check className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-emerald-500 text-white p-0.5" />}
      {status === "error" && <X className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white p-0.5" />}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
        <span>{data.icon}</span> Trigger
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{data.label}</p>
      {data.sublabel && <p className="text-xs text-muted-foreground mt-0.5">{data.sublabel}</p>}
    </div>
  );
}

function AgentNode({ data }: { data: any }) {
  const status: NodeStatus = data.status ?? "idle";
  const borderClass = status === "running" ? "animate-pulse border-primary"
    : status === "completed" ? "border-emerald-500"
    : status === "error" ? "border-destructive"
    : "border-violet-500/60";

  return (
    <div className={`rounded-xl border-2 ${borderClass} bg-card px-4 py-3 shadow-lg min-w-[180px] relative`}>
      {status === "completed" && <Check className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-emerald-500 text-white p-0.5" />}
      {status === "error" && <X className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white p-0.5" />}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-500">
        <Bot className="h-3.5 w-3.5" /> Agent
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{data.label}</p>
    </div>
  );
}

function StepNode({ data }: { data: any }) {
  const status: NodeStatus = data.status ?? "idle";
  const borderClass = status === "running" ? "animate-pulse border-primary"
    : status === "completed" ? "border-emerald-500"
    : status === "error" ? "border-destructive"
    : "border-emerald-500/60";

  return (
    <div className={`rounded-xl border-2 ${borderClass} bg-card px-4 py-3 shadow-lg min-w-[180px] relative`}>
      {status === "completed" && <Check className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-emerald-500 text-white p-0.5" />}
      {status === "error" && <X className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white p-0.5" />}
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
        <ArrowRight className="h-3.5 w-3.5" /> Action {data.order}
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{data.label}</p>
      {data.sublabel && <p className="text-xs text-muted-foreground mt-0.5">{data.sublabel}</p>}
    </div>
  );
}

const nodeTypes = { trigger: TriggerNode, agent: AgentNode, step: StepNode };

const cronPresets: Record<string, string> = {
  "* * * * *": "Chaque minute",
  "*/5 * * * *": "Toutes les 5 min",
  "0 * * * *": "Chaque heure",
  "0 9 * * *": "Tous les jours 9h",
  "0 9 * * 1-5": "Lun–Ven 9h",
  "0 9 * * 1": "Lundi 9h",
  "30 7 * * *": "Tous les jours 7h30",
  "0 8 * * *": "Tous les jours 8h",
};

function cronToHuman(cron: string): string {
  if (!cron) return "Manuel";
  return cronPresets[cron] ?? cron;
}

export function WorkflowCanvas({ workflow, steps }: WorkflowCanvasProps) {
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});

  // Realtime: listen for run_events to update node statuses
  useEffect(() => {
    if (!workflow) return;
    setNodeStatuses({});

    const channel = supabase
      .channel(`workflow-canvas-${workflow.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "run_events",
      }, (payload: any) => {
        const event = payload.new;
        const p = event.payload_json ?? {};
        if (p.debug) {
          if (p.step === "llm_request") {
            setNodeStatuses(prev => ({ ...prev, agent: "running" }));
          }
        }
        if (event.type === "tool_call") {
          setNodeStatuses(prev => ({ ...prev, agent: "completed" }));
        }
        if (event.type === "log" && p.step === "tool_call_result") {
          const status = p.success ? "completed" : "error";
          // Try to map to a step node
          setNodeStatuses(prev => ({ ...prev, [`step-tool-${p.tool}`]: status }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [workflow?.id]);

  const { nodes, edges } = useMemo(() => {
    if (!workflow) return { nodes: [], edges: [] };

    const triggerConfig = (workflow.trigger_config_json as any) ?? {};
    const triggerIcons: Record<string, string> = { cron: "📅", webhook: "🔗", event: "⚡", manual: "🖱️" };

    const ns: Node[] = [];
    const es: Edge[] = [];

    // Trigger
    ns.push({
      id: "trigger",
      type: "trigger",
      position: { x: 50, y: 80 },
      data: {
        label: workflow.trigger_type === "cron"
          ? cronToHuman(triggerConfig.cron_expr || triggerConfig.cron || "")
          : workflow.trigger_type.charAt(0).toUpperCase() + workflow.trigger_type.slice(1),
        sublabel: triggerConfig.trigger_prompt?.slice(0, 50) || null,
        icon: triggerIcons[workflow.trigger_type] ?? "🔧",
        status: nodeStatuses["trigger"] ?? "idle",
      },
      sourcePosition: Position.Right,
    });

    // Agent
    ns.push({
      id: "agent",
      type: "agent",
      position: { x: 320, y: 80 },
      data: {
        label: (workflow as any).agents?.name ?? "Agent",
        status: nodeStatuses["agent"] ?? "idle",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    es.push({
      id: "e-trigger-agent",
      source: "trigger",
      target: "agent",
      animated: true,
      style: { stroke: "hsl(217, 91%, 60%)" },
    });

    // Steps
    const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);
    let prevId = "agent";
    sortedSteps.forEach((step, i) => {
      const nodeId = `step-${i}`;
      const config = (step.action_config_json as any) ?? {};
      ns.push({
        id: nodeId,
        type: "step",
        position: { x: 590 + i * 270, y: 80 },
        data: {
          label: step.action_type,
          sublabel: config.channel ? `→ ${config.channel}` : config.to ? `→ ${config.to}` : null,
          order: i + 1,
          status: nodeStatuses[nodeId] ?? "idle",
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      es.push({
        id: `e-${prevId}-${nodeId}`,
        source: prevId,
        target: nodeId,
        animated: true,
        style: { stroke: "hsl(142, 71%, 45%)" },
      });
      prevId = nodeId;
    });

    return { nodes: ns, edges: es };
  }, [workflow, steps, nodeStatuses]);

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Zap className="h-10 w-10 mx-auto opacity-20" />
          <p className="text-sm">Sélectionne un workflow ou crée-en un via le chat</p>
          <p className="text-xs text-muted-foreground/60">Le canvas s'affichera ici en lecture seule</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} className="opacity-30" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
