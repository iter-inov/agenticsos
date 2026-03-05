import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

const ACTION_TYPES = [
  { key: "send_email", label: "Send Email" },
  { key: "calendar_create", label: "Calendar Create/Update" },
  { key: "messaging", label: "WhatsApp / Telegram Message" },
  { key: "social_post", label: "Social Media Post" },
  { key: "trigger_webhook", label: "Trigger Webhook (n8n)" },
];

type SecurityMode = "low" | "medium" | "high";

export function ApprovalsTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [mode, setMode] = useState<SecurityMode>("medium");
  const [rulesJson, setRulesJson] = useState<Record<string, any>>({});
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState({ mode: "medium" as SecurityMode, rulesJson: {} as Record<string, any> });

  useEffect(() => {
    if (!orgId) return;
    supabase.from("policies").select("*").eq("org_id", orgId).single().then(({ data }) => {
      if (data) {
        setPolicyId(data.id);
        setMode(data.mode);
        const rules = (data.rules_json as Record<string, any>) ?? {};
        setRulesJson(rules);
        setInitial({ mode: data.mode, rulesJson: { ...rules } });
      }
    });
  }, [orgId]);

  useEffect(() => {
    setDirty(mode !== initial.mode || JSON.stringify(rulesJson) !== JSON.stringify(initial.rulesJson));
  }, [mode, rulesJson, initial]);

  const toggleAction = (key: string) => {
    setRulesJson((prev) => ({ ...prev, [`approval_${key}`]: !prev[`approval_${key}`] }));
  };

  const handleSave = async () => {
    if (!policyId) return;
    setSaving(true);
    const { error } = await supabase.from("policies").update({ mode, rules_json: rulesJson }).eq("id", policyId);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setInitial({ mode, rulesJson: { ...rulesJson } });
    toast({ title: "Saved", description: "Approval settings updated." });
  };

  if (orgLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Approval Mode</CardTitle>
          <CardDescription>Choose when human approval is required</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={mode} onValueChange={(v) => setMode(v as SecurityMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Off — No approvals</SelectItem>
              <SelectItem value="medium">Smart — Risk-based</SelectItem>
              <SelectItem value="high">Always — All actions</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action Approval Matrix</CardTitle>
          <CardDescription>Toggle approval requirement per action type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ACTION_TYPES.map((action) => (
            <div key={action.key} className="flex items-center justify-between rounded-md border border-border p-3">
              <Label className="text-sm">{action.label}</Label>
              <Switch checked={!!rulesJson[`approval_${action.key}`]} onCheckedChange={() => toggleAction(action.key)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk Rules</CardTitle>
          <CardDescription>Additional guardrails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">PII detected → force approval + redact</Label>
            <Switch checked={!!rulesJson.pii_redaction} onCheckedChange={(v) => setRulesJson((p) => ({ ...p, pii_redaction: v }))} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Cost threshold for approval ($)</Label>
            <Input
              type="number"
              value={rulesJson.cost_threshold ?? ""}
              placeholder="e.g. 5"
              onChange={(e) => setRulesJson((p) => ({ ...p, cost_threshold: Number(e.target.value) }))}
            />
          </div>
        </CardContent>
      </Card>

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
          <Button variant="outline" size="sm" onClick={() => { setMode(initial.mode); setRulesJson({ ...initial.rulesJson }); }}>Discard</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
