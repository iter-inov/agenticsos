import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Copy, RefreshCw } from "lucide-react";
import { McpBuilder } from "./McpBuilder";

function generateSecret() {
  return "whsec_" + crypto.randomUUID().replace(/-/g, "");
}

export function ApiWebhooksTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState({ url: "", secret: "" });

  useEffect(() => {
    if (!orgId) return;
    supabase.from("orgs").select("webhook_url, webhook_secret").eq("id", orgId).single().then(({ data }) => {
      const d = data as any;
      setWebhookUrl(d?.webhook_url ?? "");
      setWebhookSecret(d?.webhook_secret ?? "");
      setInitial({ url: d?.webhook_url ?? "", secret: d?.webhook_secret ?? "" });
    });
  }, [orgId]);

  useEffect(() => {
    setDirty(webhookUrl !== initial.url || webhookSecret !== initial.secret);
  }, [webhookUrl, webhookSecret, initial]);

  const rotateSecret = () => {
    const newSecret = generateSecret();
    setWebhookSecret(newSecret);
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase.from("orgs").update({ webhook_url: webhookUrl, webhook_secret: webhookSecret } as any).eq("id", orgId);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setInitial({ url: webhookUrl, secret: webhookSecret });
    toast({ title: "Saved", description: "Webhook settings updated." });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  if (orgLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Incoming Webhook</CardTitle>
          <CardDescription>Configure a webhook URL to trigger runs externally</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Webhook Secret</Label>
            <div className="flex gap-2">
              <Input value={webhookSecret} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={() => copyToClipboard(webhookSecret)}><Copy className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={rotateSecret}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
          <Button variant="outline" size="sm" onClick={() => { setWebhookUrl(initial.url); setWebhookSecret(initial.secret); }}>Discard</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      )}

      {/* MCP Server Connection */}
      <Card>
        <CardHeader>
          <CardTitle>MCP Server Endpoint</CardTitle>
          <CardDescription>
            Connect Lovable (or any MCP client) to your custom MCP server running as a backend function.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Server URL</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mcp-server`}
                className="font-mono text-xs"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() =>
                  copyToClipboard(
                    `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mcp-server`
                  )
                }
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">How to connect:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Copy the URL above</li>
              <li>Go to <span className="font-medium text-foreground">Settings → Connectors → New MCP Server</span></li>
              <li>Paste the URL and add your <code className="text-xs bg-muted px-1 py-0.5 rounded">MCP_AUTH_TOKEN</code> as the Bearer token</li>
            </ol>
            <p className="pt-2">Available tools: <code className="text-xs bg-muted px-1 py-0.5 rounded">get_customers</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">create_ticket</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">query_data</code></p>
          </div>
        </CardContent>
      </Card>

      {/* MCP Builder */}
      <McpBuilder />
    </div>
  );
}
