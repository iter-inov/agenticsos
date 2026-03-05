import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Plug, PlugZap, AlertCircle } from "lucide-react";
import { GoogleConnectButton } from "@/components/settings/GoogleConnectButton";

interface ToolWithConnection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  type: string;
  connectionId?: string;
  status: "connected" | "disconnected" | "error";
}

export function ToolsConnectionsTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [tools, setTools] = useState<ToolWithConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTools = async () => {
    if (!orgId) return;
    const [{ data: allTools }, { data: connections }] = await Promise.all([
      supabase.from("tools").select("*").eq("is_active", true),
      supabase.from("tool_connections").select("*").eq("org_id", orgId),
    ]);
    if (allTools) {
      setTools(allTools.map((t) => {
        const conn = connections?.find((c) => c.tool_id === t.id);
        return { ...t, connectionId: conn?.id, status: conn?.status ?? "disconnected" };
      }));
    }
    setLoading(false);
  };

  useEffect(() => { fetchTools(); }, [orgId]);

  const toggleConnection = async (tool: ToolWithConnection) => {
    if (!orgId) return;
    if (tool.status === "connected" && tool.connectionId) {
      await supabase.from("tool_connections").update({ status: "disconnected" }).eq("id", tool.connectionId);
      toast({ title: `${tool.name} disconnected` });
    } else if (tool.connectionId) {
      await supabase.from("tool_connections").update({ status: "connected", connected_at: new Date().toISOString() }).eq("id", tool.connectionId);
      toast({ title: `${tool.name} connected` });
    } else {
      await supabase.from("tool_connections").insert({ org_id: orgId, tool_id: tool.id, status: "connected", connected_at: new Date().toISOString() });
      toast({ title: `${tool.name} connected` });
    }
    fetchTools();
  };

  if (orgLoading || loading) return <Skeleton className="h-64 w-full" />;

  const statusIcon = (s: string) => {
    if (s === "connected") return <PlugZap className="h-4 w-4 text-[hsl(var(--success))]" />;
    if (s === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <Plug className="h-4 w-4 text-muted-foreground" />;
  };

  const connectedCount = tools.filter(t => t.status === "connected").length;

  return (
    <div className="space-y-4">
      {connectedCount > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/50 p-3">
          <PlugZap className="h-5 w-5 text-primary" />
          <div className="text-sm">
            <span className="font-medium text-foreground">{connectedCount} tool(s) connected</span>
            <span className="text-muted-foreground"> — go to the MCP Builder tab to generate your MCP config from these tools.</span>
          </div>
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tool Connections</CardTitle>
              <CardDescription>Manage integrations for your workspace</CardDescription>
            </div>
            <GoogleConnectButton />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {tools.map((tool) => (
            <div key={tool.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="flex items-center gap-3">
                {statusIcon(tool.status)}
                <div>
                  <p className="text-sm font-medium text-foreground">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={tool.status === "connected" ? "default" : "secondary"} className="capitalize">{tool.status}</Badge>
                <Button size="sm" variant={tool.status === "connected" ? "outline" : "default"} onClick={() => toggleConnection(tool)}>
                  {tool.status === "connected" ? "Disconnect" : "Connect"}
                </Button>
              </div>
            </div>
          ))}
          {tools.length === 0 && <p className="text-sm text-muted-foreground">No tools available.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
