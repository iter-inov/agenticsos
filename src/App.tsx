import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { useOrgId } from "@/hooks/useOrgId";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Tools from "./pages/Tools";
import Workflows from "./pages/Workflows";
import Settings from "./pages/Settings";
import McpTestDashboard from "./pages/McpTestDashboard";
import Onboarding from "./pages/Onboarding";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import DebugDiagnostic from "./pages/DebugDiagnostic";
import Social from "./pages/Social";
import Inbox from "./pages/Inbox";
import Reports from "./pages/Reports";

const queryClient = new QueryClient();

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { orgId, loading: orgLoading } = useOrgId();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (orgLoading || !orgId) return;

    // Check if onboarding is completed
    supabase.from("orgs").select("onboarding_completed").eq("id", orgId).single().then(({ data }) => {
      const completed = (data as any)?.onboarding_completed;
      if (completed) {
        setNeedsOnboarding(false);
      } else {
        // Check if org has agents
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("org_id", orgId).then(({ count }) => {
          if ((count ?? 0) === 0) {
            setNeedsOnboarding(true);
            navigate("/onboarding", { replace: true });
          } else {
            // Has agents, mark onboarding as done
            supabase.from("orgs").update({ onboarding_completed: true } as any).eq("id", orgId);
            setNeedsOnboarding(false);
          }
        });
      }
    });
  }, [orgId, orgLoading, navigate]);

  if (orgLoading || needsOnboarding === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <OnboardingGuard>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route
          path="/*"
          element={
            <AppLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/tools" element={<Tools />} />
                <Route path="/workflows" element={<Workflows />} />
                <Route path="/social" element={<Social />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/mcp-test" element={<McpTestDashboard />} />
                <Route path="/debug/diagnostic" element={<DebugDiagnostic />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppLayout>
          }
        />
      </Routes>
    </OnboardingGuard>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
