import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface RunRow {
  id: string;
  status: string;
  source: string;
  created_at: string;
  total_cost: number | null;
  total_tokens: number | null;
  agent_name: string;
  agent_id: string | null;
}

export function AuditLogsTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    supabase.from("agents").select("id, name").eq("org_id", orgId).then(({ data }) => {
      if (data) setAgents(data);
    });
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    let query = supabase.from("runs").select("id, status, source, created_at, total_cost, total_tokens, agent_id, agents(name)").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100);
    if (filterAgent !== "all") query = query.eq("agent_id", filterAgent);
    if (filterStatus !== "all") query = query.eq("status", filterStatus as any);
    query.then(({ data }) => {
      setRuns((data ?? []).map((r: any) => ({ ...r, agent_name: r.agents?.name ?? "—" })));
      setLoading(false);
    });
  }, [orgId, filterAgent, filterStatus]);

  if (orgLoading) return <Skeleton className="h-64 w-full" />;

  const statusColor = (s: string) => {
    if (s === "completed") return "default";
    if (s === "failed") return "destructive";
    return "secondary";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logs</CardTitle>
        <CardDescription>Recent runs and execution history</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["pending", "running", "completed", "failed", "cancelled"].map(s => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : runs.length > 0 ? (
          <div className="rounded-md border border-border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-xs">{format(new Date(run.created_at), "MMM d, HH:mm")}</TableCell>
                    <TableCell className="text-sm">{run.agent_name}</TableCell>
                    <TableCell className="capitalize text-xs">{run.source}</TableCell>
                    <TableCell><Badge variant={statusColor(run.status) as any} className="capitalize">{run.status}</Badge></TableCell>
                    <TableCell className="text-right text-xs">{run.total_tokens ?? 0}</TableCell>
                    <TableCell className="text-right text-xs">${(run.total_cost ?? 0).toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No runs found.</p>
        )}
      </CardContent>
    </Card>
  );
}
