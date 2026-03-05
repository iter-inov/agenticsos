import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { toast } from "sonner";

function SecretField({ label, secretKey, orgId }: { label: string; secretKey: string; orgId: string }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("secrets").upsert(
      { org_id: orgId, name: secretKey, encrypted_payload: value.trim() },
      { onConflict: "org_id,name" }
    );
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de la sauvegarde");
    } else {
      setSaved(true);
      toast.success(`${label} sauvegardé`);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          placeholder="••••••••"
          className="bg-background font-mono text-xs"
        />
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || !value.trim()}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function SocialMediaTab() {
  const { orgId } = useOrgId();
  const [testingX, setTestingX] = useState(false);
  const [xResult, setXResult] = useState<string | null>(null);

  const handleTestX = async () => {
    if (!orgId) return;
    setTestingX(true);
    setXResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tool-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tool_slug: "x_get_me", action: "execute", args: {} }),
      });
      const data = await resp.json();
      if (data.ok) {
        setXResult(`✅ Connecté en tant que @${data.data?.username ?? "unknown"}`);
      } else {
        setXResult(`❌ ${data.error}`);
      }
    } catch (err: any) {
      setXResult(`❌ ${err.message}`);
    }
    setTestingX(false);
  };

  if (!orgId) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">Social Media</h2>
        <p className="text-sm text-muted-foreground">Configure les credentials pour X (Twitter), Instagram et Facebook</p>
      </div>

      {/* X / Twitter */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">𝕏</span>
            <div>
              <h3 className="font-semibold text-foreground">X (Twitter)</h3>
              <p className="text-xs text-muted-foreground">API v2 — Poster, lire et rechercher</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">API Key</Badge>
        </div>

        <div className="grid gap-3">
          <SecretField label="API Key (Consumer Key)" secretKey="x_consumer_key" orgId={orgId} />
          <SecretField label="API Secret (Consumer Secret)" secretKey="x_consumer_secret" orgId={orgId} />
          <SecretField label="Access Token" secretKey="x_access_token" orgId={orgId} />
          <SecretField label="Access Token Secret" secretKey="x_access_token_secret" orgId={orgId} />
          <SecretField label="Bearer Token (lecture seule)" secretKey="x_bearer_token" orgId={orgId} />
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={handleTestX} disabled={testingX}>
            {testingX ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Tester la connexion
          </Button>
          {xResult && (
            <span className="text-sm">{xResult}</span>
          )}
        </div>
      </div>

      {/* Instagram */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📸</span>
            <div>
              <h3 className="font-semibold text-foreground">Instagram</h3>
              <p className="text-xs text-muted-foreground">Graph API — Poster des photos et lire les stats</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">OAuth</Badge>
        </div>

        <div className="grid gap-3">
          <SecretField label="Instagram User Access Token" secretKey="instagram_access_token" orgId={orgId} />
          <SecretField label="Instagram Business Account ID" secretKey="instagram_account_id" orgId={orgId} />
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Instagram nécessite un compte Business connecté à une Page Facebook
        </div>
      </div>

      {/* Facebook */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📘</span>
            <div>
              <h3 className="font-semibold text-foreground">Facebook Pages</h3>
              <p className="text-xs text-muted-foreground">Graph API — Poster sur vos pages</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">OAuth</Badge>
        </div>

        <div className="grid gap-3">
          <SecretField label="Page Access Token" secretKey="facebook_page_token" orgId={orgId} />
          <SecretField label="Page ID" secretKey="facebook_page_id" orgId={orgId} />
        </div>
      </div>
    </div>
  );
}
