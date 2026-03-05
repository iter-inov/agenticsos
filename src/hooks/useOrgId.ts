import { useAuth } from "@/contexts/AuthContext";

/**
 * Backward-compatible hook that returns orgId from the AuthContext.
 * All 23+ components that use this hook will continue to work without changes.
 */
export function useOrgId() {
  const { org, orgLoading } = useAuth();
  return { orgId: org?.orgId ?? null, loading: orgLoading };
}
