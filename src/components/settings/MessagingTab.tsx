import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, MessageCircle, Send } from "lucide-react";

export function MessagingTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const { toast } = useToast();

  // WhatsApp state
  const [waPhoneId, setWaPhoneId] = useState("");
  const [waToken, setWaToken] = useState("");
  const [waVerifyToken, setWaVerifyToken] = useState("");
  const [waStatus, setWaStatus] = useState<"unknown" | "connected" | "error" | "testing">("unknown");
  const [waSaving, setWaSaving] = useState(false);

  // Telegram state
  const [tgToken, setTgToken] = useState("");
  const [tgTestChatId, setTgTestChatId] = useState("");
  const [tgStatus, setTgStatus] = useState<"unknown" | "connected" | "error" | "testing">("unknown");
  const [tgBotName, setTgBotName] = useState("");
  const [tgSaving, setTgSaving] = useState(false);

  // Load existing secrets
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data: secrets } = await supabase
        .from("secrets")
        .select("name, encrypted_payload")
        .eq("org_id", orgId)
        .in("name", [
          "whatsapp_phone_number_id",
          "whatsapp_access_token",
          "whatsapp_verify_token",
          "telegram_bot_token",
          "telegram_test_chat_id",
        ]);

      if (secrets) {
        for (const s of secrets) {
          if (s.name === "whatsapp_phone_number_id") setWaPhoneId(s.encrypted_payload ? "••••••" : "");
          if (s.name === "whatsapp_access_token") { if (s.encrypted_payload) setWaStatus("connected"); }
          if (s.name === "telegram_bot_token") { if (s.encrypted_payload) setTgStatus("connected"); }
          if (s.name === "telegram_test_chat_id") setTgTestChatId(s.encrypted_payload || "");
        }
      }
    })();
  }, [orgId]);

  const upsertSecret = async (name: string, value: string) => {
    if (!orgId) return;
    const { data: existing } = await supabase
      .from("secrets")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", name)
      .single();

    if (existing) {
      await supabase.from("secrets").update({ encrypted_payload: value }).eq("id", existing.id);
    } else {
      await supabase.from("secrets").insert({ org_id: orgId, name, encrypted_payload: value });
    }
  };

  // ── WhatsApp ──
  const testWhatsApp = async () => {
    if (!waPhoneId || !waToken) {
      toast({ title: "Missing fields", description: "Phone Number ID and Access Token are required", variant: "destructive" });
      return;
    }
    setWaStatus("testing");
    try {
      const resp = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}`, {
        headers: { Authorization: `Bearer ${waToken}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.id) {
        setWaStatus("connected");
        toast({ title: "WhatsApp connected ✅", description: `Phone: ${data.display_phone_number ?? data.id}` });
      } else {
        throw new Error("Invalid response");
      }
    } catch (err: any) {
      setWaStatus("error");
      toast({ title: "WhatsApp test failed", description: err.message, variant: "destructive" });
    }
  };

  const saveWhatsApp = async () => {
    if (!orgId) return;
    setWaSaving(true);
    try {
      await Promise.all([
        upsertSecret("whatsapp_phone_number_id", waPhoneId),
        upsertSecret("whatsapp_access_token", waToken),
        waVerifyToken && upsertSecret("whatsapp_verify_token", waVerifyToken),
      ]);

      // Update tool_connections for WhatsApp tools
      const { data: waTool } = await supabase
        .from("tools")
        .select("id")
        .eq("slug", "whatsapp")
        .single();

      if (waTool) {
        const { data: existing } = await supabase
          .from("tool_connections")
          .select("id")
          .eq("org_id", orgId)
          .eq("tool_id", waTool.id)
          .single();

        if (existing) {
          await supabase.from("tool_connections").update({ status: "connected", connected_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          await supabase.from("tool_connections").insert({ org_id: orgId, tool_id: waTool.id, status: "connected", connected_at: new Date().toISOString() });
        }
      }

      toast({ title: "WhatsApp credentials saved ✅" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setWaSaving(false);
  };

  // ── Telegram ──
  const testTelegram = async () => {
    if (!tgToken) {
      toast({ title: "Missing token", variant: "destructive" });
      return;
    }
    setTgStatus("testing");
    try {
      const resp = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
      const data = await resp.json();
      if (data.ok && data.result) {
        setTgStatus("connected");
        setTgBotName(data.result.username ?? data.result.first_name);
        toast({ title: "Telegram connected ✅", description: `Bot: @${data.result.username}` });
      } else {
        throw new Error(data.description ?? "Invalid response");
      }
    } catch (err: any) {
      setTgStatus("error");
      toast({ title: "Telegram test failed", description: err.message, variant: "destructive" });
    }
  };

  const saveTelegram = async () => {
    if (!orgId) return;
    setTgSaving(true);
    try {
      await Promise.all([
        upsertSecret("telegram_bot_token", tgToken),
        tgTestChatId && upsertSecret("telegram_test_chat_id", tgTestChatId),
      ]);

      // Update tool_connections for Telegram
      const { data: tgTool } = await supabase
        .from("tools")
        .select("id")
        .eq("slug", "telegram")
        .single();

      if (tgTool) {
        const { data: existing } = await supabase
          .from("tool_connections")
          .select("id")
          .eq("org_id", orgId)
          .eq("tool_id", tgTool.id)
          .single();

        if (existing) {
          await supabase.from("tool_connections").update({ status: "connected", connected_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          await supabase.from("tool_connections").insert({ org_id: orgId, tool_id: tgTool.id, status: "connected", connected_at: new Date().toISOString() });
        }
      }

      toast({ title: "Telegram credentials saved ✅" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setTgSaving(false);
  };

  if (orgLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Messaging Channels</h2>
        <p className="text-sm text-muted-foreground">
          Connect WhatsApp and Telegram so your agents can send and receive messages.
        </p>
      </div>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366]/10">
                <MessageCircle className="h-5 w-5 text-[#25D366]" />
              </div>
              <div>
                <CardTitle className="text-base">WhatsApp Business API</CardTitle>
                <CardDescription>Send messages via Meta WhatsApp Cloud API</CardDescription>
              </div>
            </div>
            <StatusBadge status={waStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Phone Number ID</Label>
              <Input
                placeholder="e.g. 123456789012345"
                value={waPhoneId === "••••••" ? "" : waPhoneId}
                onChange={(e) => setWaPhoneId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input
                type="password"
                placeholder="Permanent access token"
                value={waToken}
                onChange={(e) => setWaToken(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Webhook Verify Token (optional)</Label>
            <Input
              placeholder="Custom verify token for webhook setup"
              value={waVerifyToken}
              onChange={(e) => setWaVerifyToken(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testWhatsApp} disabled={waStatus === "testing"}>
              {waStatus === "testing" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Test Connection
            </Button>
            <Button onClick={saveWhatsApp} disabled={waSaving || !waPhoneId || !waToken}>
              {waSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Credentials
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Get your credentials from{" "}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener" className="text-primary hover:underline">
              Meta Developer Portal
            </a>
            . Tools: whatsapp_send_message, whatsapp_send_template
          </p>
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0088cc]/10">
                <Send className="h-5 w-5 text-[#0088cc]" />
              </div>
              <div>
                <CardTitle className="text-base">Telegram Bot</CardTitle>
                <CardDescription>
                  Send messages via Telegram Bot API
                  {tgBotName && <> — <span className="text-primary">@{tgBotName}</span></>}
                </CardDescription>
              </div>
            </div>
            <StatusBadge status={tgStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Bot Token</Label>
              <Input
                type="password"
                placeholder="123456:ABC-DEF..."
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Test Chat ID (optional)</Label>
              <Input
                placeholder="e.g. 123456789"
                value={tgTestChatId}
                onChange={(e) => setTgTestChatId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testTelegram} disabled={tgStatus === "testing"}>
              {tgStatus === "testing" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Test Connection
            </Button>
            <Button onClick={saveTelegram} disabled={tgSaving || !tgToken}>
              {tgSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Credentials
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Create a bot with{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener" className="text-primary hover:underline">
              @BotFather
            </a>
            . Tools: telegram_send_message, telegram_send_photo, telegram_get_updates
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <Badge variant="outline" className="border-success/30 text-success gap-1">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  }
  if (status === "testing") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Testing...
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Not configured
    </Badge>
  );
}
