import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Play, Pause, Pencil, Trash2, Calendar, Clock, Webhook, Zap,
  CheckCircle, XCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tables } from "@/integrations/supabase/types";

interface WorkflowWithAgent extends Tables<"workflows"> {
  agents: { name: string } | null;
}

interface WorkflowCardsProps {
  workflows: WorkflowWithAgent[];
  scheduledRuns: any[];
  selectedId: string | null;
  onSelect: (wf: WorkflowWithAgent) => void;
  onRunNow: (wf: WorkflowWithAgent) => void;
  onToggle: (wf: WorkflowWithAgent) => void;
  onEdit: (wf: WorkflowWithAgent) => void;
  onDelete: (wf: WorkflowWithAgent) => void;
}

const triggerIcons: Record<string, React.ComponentType<any>> = {
  manual: Clock, cron: Calendar, webhook: Webhook, event: Zap,
};

export function WorkflowCards({
  workflows, scheduledRuns, selectedId,
  onSelect, onRunNow, onToggle, onEdit, onDelete,
}: WorkflowCardsProps) {
  if (workflows.length === 0) return null;

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-3 p-1 pb-2">
        {workflows.map(wf => {
          const TriggerIcon = triggerIcons[wf.trigger_type] || Clock;
          const sr = scheduledRuns.find((s: any) => s.workflow_id === wf.id);
          const triggerConfig = (wf.trigger_config_json as any) ?? {};
          const isSelected = selectedId === wf.id;

          return (
            <div
              key={wf.id}
              onClick={() => onSelect(wf)}
              className={`flex-shrink-0 w-[280px] rounded-xl border p-3 cursor-pointer transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                    <TriggerIcon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground leading-tight">{wf.name}</h4>
                    <p className="text-[10px] text-muted-foreground">{wf.agents?.name ?? "No agent"}</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${wf.is_active ? "border-success/30 text-success" : "border-muted-foreground/30 text-muted-foreground"}`}
                >
                  {wf.is_active ? "actif" : "pausé"}
                </Badge>
              </div>

              {/* Schedule info */}
              <div className="text-xs text-muted-foreground space-y-0.5 mb-2">
                {wf.trigger_type === "cron" && sr?.next_run_at && (
                  <p>⏱ Prochain run : {formatDistanceToNow(new Date(sr.next_run_at), { addSuffix: true, locale: fr })}</p>
                )}
                {wf.trigger_type === "cron" && !sr && (
                  <p className="text-warning">⚠️ Non planifié</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pt-1 border-t border-border">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={e => { e.stopPropagation(); onRunNow(wf); }}>
                  <Play className="h-3 w-3" /> Run
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={e => { e.stopPropagation(); onToggle(wf); }}>
                  {wf.is_active ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Resume</>}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={e => { e.stopPropagation(); onEdit(wf); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); onDelete(wf); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
