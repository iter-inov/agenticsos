import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const TIMEZONES = ["UTC", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Asia/Shanghai"];

export function WorkspaceTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [members, setMembers] = useState<{ user_id: string; role: string; email?: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState({ name: "", timezone: "UTC" });

  useEffect(() => {
    if (!orgId) return;
    supabase.from("orgs").select("name, timezone").eq("id", orgId).single().then(({ data }) => {
      if (data) {
        setName(data.name);
        setTimezone((data as any).timezone ?? "UTC");
        setInitial({ name: data.name, timezone: (data as any).timezone ?? "UTC" });
      }
    });
    supabase.from("org_members").select("user_id, role").eq("org_id", orgId).then(({ data }) => {
      if (data) {
        // Fetch profiles for emails
        const userIds = data.map(m => m.user_id);
        supabase.from("profiles").select("user_id, email").in("user_id", userIds).then(({ data: profiles }) => {
          setMembers(data.map(m => ({
            ...m,
            email: profiles?.find(p => p.user_id === m.user_id)?.email ?? undefined,
          })));
        });
      }
    });
  }, [orgId]);

  useEffect(() => {
    setDirty(name !== initial.name || timezone !== initial.timezone);
  }, [name, timezone, initial]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase.from("orgs").update({ name, timezone } as any).eq("id", orgId);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setInitial({ name, timezone });
    toast({ title: "Saved", description: "Workspace settings updated." });
  };

  if (orgLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Workspace name and timezone for scheduler</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Workspace Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People in this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between rounded-md border border-border p-3">
                <span className="text-sm text-foreground">{m.email ?? m.user_id.slice(0, 8)}</span>
                <Badge variant="secondary" className="capitalize">{m.role}</Badge>
              </div>
            ))}
            {members.length === 0 && <p className="text-sm text-muted-foreground">No members found.</p>}
          </div>
        </CardContent>
      </Card>

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
          <Button variant="outline" size="sm" onClick={() => { setName(initial.name); setTimezone(initial.timezone); }}>Discard</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
