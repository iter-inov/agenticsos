import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GoogleOAuthBanner() {
  const { orgId } = useOrgId();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      // Check if Google mcp_tools exist but no oauth_tokens
      const [{ count: googleToolCount }, { count: oauthCount }] = await Promise.all([
        supabase.from("mcp_tools").select("id", { count: "exact", head: true }).eq("org_id", orgId).in("name", ["gmail_read_inbox", "gdrive_search", "calendar_list_events"]),
        supabase.from("oauth_tokens").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("provider", "google"),
      ]);
      // Show banner if there are Google tools but no tokens, OR always if no tokens (to encourage connection)
      setShow((oauthCount ?? 0) === 0);
    })();
  }, [orgId]);

  if (!show || !orgId) return null;

  const connectGoogle = () => {
    window.location.href = `/mcp-test?action=connect_google`;
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-warning/30 bg-warning/5 p-3 mb-4">
      <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium text-foreground">Google non connecté</span>
        <span className="text-muted-foreground"> — vos agents ne peuvent pas utiliser Gmail, Drive ou Calendar.</span>
      </div>
      <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={connectGoogle}>
        <ExternalLink className="h-3 w-3" />
        Connecter Google
      </Button>
    </div>
  );
}
