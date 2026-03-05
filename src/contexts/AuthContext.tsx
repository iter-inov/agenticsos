import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type OrgRole = "owner" | "admin" | "member";

interface OrgContext {
  orgId: string;
  role: OrgRole;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  org: OrgContext | null;
  orgLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  org: null,
  orgLoading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgContext | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  const loadOrg = useCallback(async (userId: string) => {
    setOrgLoading(true);
    const { data } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (data) {
      setOrg({ orgId: data.org_id, role: data.role as OrgRole });
    } else {
      setOrg(null);
    }
    setOrgLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);

        if (session?.user) {
          loadOrg(session.user.id);
        } else {
          setOrg(null);
          setOrgLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);

      if (session?.user) {
        loadOrg(session.user.id);
      } else {
        setOrgLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadOrg]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setOrg(null);
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      org,
      orgLoading,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
