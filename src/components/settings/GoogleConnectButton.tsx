import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Loader2, ExternalLink } from "lucide-react";

export function GoogleConnectButton({ className }: { className?: string }) {
  const { orgId } = useOrgId();
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/google-oauth-start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ org_id: orgId }),
      });
      const data = await resp.json();
      if (data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error("No OAuth URL returned");
      }
    } catch (err: any) {
      console.error("Google OAuth error:", err.message);
    }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" className={`gap-1 ${className ?? ""}`} onClick={connect} disabled={loading}>
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
      Connect Google
    </Button>
  );
}
