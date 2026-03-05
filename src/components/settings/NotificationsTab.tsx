import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

const NOTIFICATION_PREFS = [
  { key: "notify_approval", label: "Notify on approval request" },
  { key: "notify_failure", label: "Notify on run failure" },
  { key: "notify_budget", label: "Notify on budget threshold" },
];

export function NotificationsTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!orgId) return;
    supabase.from("orgs").select("notification_prefs").eq("id", orgId).single().then(({ data }) => {
      const p = ((data as any)?.notification_prefs as Record<string, boolean>) ?? {};
      setPrefs(p);
      setInitial({ ...p });
    });
  }, [orgId]);

  useEffect(() => {
    setDirty(JSON.stringify(prefs) !== JSON.stringify(initial));
  }, [prefs, initial]);

  const toggle = (key: string) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase.from("orgs").update({ notification_prefs: prefs } as any).eq("id", orgId);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setInitial({ ...prefs });
    toast({ title: "Saved", description: "Notification preferences updated." });
  };

  if (orgLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Notifications</CardTitle>
          <CardDescription>Choose which events trigger email alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTIFICATION_PREFS.map((pref) => (
            <div key={pref.key} className="flex items-center justify-between rounded-md border border-border p-3">
              <Label className="text-sm">{pref.label}</Label>
              <Switch checked={!!prefs[pref.key]} onCheckedChange={() => toggle(pref.key)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
          <Button variant="outline" size="sm" onClick={() => setPrefs({ ...initial })}>Discard</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
