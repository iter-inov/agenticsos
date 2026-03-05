import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function BillingTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [budget, setBudget] = useState<{ id: string; monthly_limit: number; hard_stop: boolean; alert_thresholds: number[] } | null>(null);
  const [usageData, setUsageData] = useState<{ date: string; cost: number }[]>([]);
  const [agentUsage, setAgentUsage] = useState<{ agent_name: string; cost: number }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState<typeof budget>(null);

  useEffect(() => {
    if (!orgId) return;
    supabase.from("budgets").select("*").eq("org_id", orgId).single().then(({ data }) => {
      if (data) {
        const b = {
          id: data.id,
          monthly_limit: Number(data.monthly_limit ?? 50),
          hard_stop: data.hard_stop ?? true,
          alert_thresholds: (data.alert_thresholds as number[]) ?? [50, 80, 95],
        };
        setBudget(b);
        setInitial({ ...b });
      }
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    supabase.from("usage_daily").select("date, cost").eq("org_id", orgId).gte("date", thirtyDaysAgo).order("date").then(({ data }) => {
      setUsageData(data?.map(d => ({ date: d.date, cost: Number(d.cost ?? 0) })) ?? []);
    });

    supabase.from("usage_by_agent_daily").select("agent_id, cost, agents(name)").eq("org_id", orgId).then(({ data }) => {
      if (data) {
        const map = new Map<string, number>();
        data.forEach((d: any) => {
          const name = d.agents?.name ?? d.agent_id.slice(0, 8);
          map.set(name, (map.get(name) ?? 0) + Number(d.cost ?? 0));
        });
        setAgentUsage(Array.from(map.entries()).map(([agent_name, cost]) => ({ agent_name, cost })));
      }
    });
  }, [orgId]);

  useEffect(() => {
    if (!budget || !initial) return;
    setDirty(budget.monthly_limit !== initial.monthly_limit || budget.hard_stop !== initial.hard_stop);
  }, [budget, initial]);

  const handleSave = async () => {
    if (!budget) return;
    setSaving(true);
    const { error } = await supabase.from("budgets").update({ monthly_limit: budget.monthly_limit, hard_stop: budget.hard_stop }).eq("id", budget.id);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setInitial({ ...budget });
    toast({ title: "Saved", description: "Budget settings updated." });
  };

  if (orgLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
          <CardDescription>Set monthly spending limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Monthly Limit ($)</Label>
            <Input type="number" value={budget?.monthly_limit ?? 50} onChange={(e) => setBudget(b => b ? { ...b, monthly_limit: Number(e.target.value) } : b)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Hard stop (auto-pause when reached)</Label>
            <Switch checked={budget?.hard_stop ?? true} onCheckedChange={(v) => setBudget(b => b ? { ...b, hard_stop: v } : b)} />
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Alert thresholds: {budget?.alert_thresholds?.join("%, ")}%</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {usageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={usageData}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No usage data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {agentUsage.map((a) => (
            <div key={a.agent_name} className="flex justify-between text-sm">
              <span className="text-foreground">{a.agent_name}</span>
              <span className="text-muted-foreground">${a.cost.toFixed(4)}</span>
            </div>
          ))}
          {agentUsage.length === 0 && <p className="text-sm text-muted-foreground">No agent usage data.</p>}
        </CardContent>
      </Card>

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
          <Button variant="outline" size="sm" onClick={() => setBudget(initial ? { ...initial } : null)}>Discard</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
