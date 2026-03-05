import { useState, useEffect } from "react";
import {
  Mail, HardDrive, Calendar, FileText, Workflow, Table,
  TrendingUp, MessageCircle, Send, Camera, AtSign, Globe,
  CheckCircle, Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const iconMap: Record<string, React.ComponentType<any>> = {
  Mail, HardDrive, Calendar, FileText, Workflow, Table,
  TrendingUp, MessageCircle, Send, Camera, AtSign, Globe,
};

interface ToolRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  icon_url: string | null;
  is_active: boolean | null;
  connected: boolean;
}

export default function Tools() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: membership } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!membership) { setLoading(false); return; }
      setOrgId(membership.org_id);

      const [{ data: allTools }, { data: connections }] = await Promise.all([
        supabase.from("tools").select("*").eq("is_active", true),
        supabase.from("tool_connections").select("tool_id, status").eq("org_id", membership.org_id),
      ]);

      const connectedIds = new Set(
        (connections || []).filter(c => c.status === "connected").map(c => c.tool_id)
      );

      setTools(
        (allTools || []).map(t => ({
          ...t,
          connected: connectedIds.has(t.id),
        }))
      );
      setLoading(false);
    })();
  }, [user]);

  const toggleTool = async (toolId: string, currentlyConnected: boolean) => {
    if (!orgId) return;
    setTogglingId(toolId);
    try {
      if (currentlyConnected) {
        await supabase
          .from("tool_connections")
          .update({ status: "disconnected" as const })
          .eq("org_id", orgId)
          .eq("tool_id", toolId);
      } else {
        const { data: existing } = await supabase
          .from("tool_connections")
          .select("id")
          .eq("org_id", orgId)
          .eq("tool_id", toolId)
          .limit(1)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("tool_connections")
            .update({ status: "connected" as const, connected_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("tool_connections").insert({
            org_id: orgId,
            tool_id: toolId,
            status: "connected" as const,
            connected_at: new Date().toISOString(),
          });
        }
      }
      setTools(prev =>
        prev.map(t => t.id === toolId ? { ...t, connected: !currentlyConnected } : t)
      );
      toast({ title: currentlyConnected ? "Tool disconnected" : "Tool connected" });
    } catch {
      toast({ title: "Error", description: "Failed to update connection", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const categories = Array.from(new Set(tools.map(t => t.category).filter(Boolean)));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Tools</h1>
        <p className="text-sm text-muted-foreground">Connect your agents to external services</p>
      </div>

      {categories.map(cat => (
        <div key={cat} className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {cat}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.filter(t => t.category === cat).map(tool => {
              const iconName = tool.icon_url || "Globe";
              const Icon = iconMap[iconName] || Globe;
              return (
                <Card
                  key={tool.id}
                  className={`transition-all ${tool.connected ? "border-primary/30 glow-blue-sm" : ""}`}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tool.connected ? "bg-primary/10" : "bg-muted"}`}>
                      <Icon className={`h-5 w-5 ${tool.connected ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold truncate">{tool.name}</h3>
                        {tool.connected && <CheckCircle className="h-3 w-3 text-success shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    <Switch
                      checked={tool.connected}
                      disabled={togglingId === tool.id}
                      onCheckedChange={() => toggleTool(tool.id, tool.connected)}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
