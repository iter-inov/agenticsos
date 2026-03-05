import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface TenantContext {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  isServiceCall: boolean;
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status: number) {
  return jsonResponse({ error: message }, status);
}

/**
 * Unified auth middleware for all edge functions.
 * Extracts and validates the tenant context from the request.
 *
 * Supports two auth modes:
 * 1. Service role key (service-to-service): org_id must be in the request body
 * 2. User JWT: org_id is resolved from org_members
 *
 * Returns a TenantContext or an error Response.
 */
export async function resolveTenantContext(
  req: Request,
  body?: Record<string, unknown>,
): Promise<TenantContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }

  const token = authHeader.slice(7);
  const sb = getServiceClient();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Mode 1: Service role key
  if (token === serviceKey) {
    const orgId = body?.org_id as string | undefined;
    if (!orgId) {
      return errorResponse("org_id required for service calls", 400);
    }
    const { data: org } = await sb.from("orgs").select("id").eq("id", orgId).single();
    if (!org) {
      return errorResponse("Invalid org", 403);
    }
    return {
      orgId,
      userId: "system",
      role: "owner",
      isServiceCall: true,
    };
  }

  // Mode 2: User JWT
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return errorResponse("Invalid token", 401);
  }

  // If org_id is provided in the request, validate membership for that specific org
  const requestedOrgId = body?.org_id as string | undefined;

  let membership: { org_id: string; role: string } | null = null;

  if (requestedOrgId) {
    const { data } = await sb
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("org_id", requestedOrgId)
      .single();
    membership = data;
    if (!membership) {
      return errorResponse("Access denied to this organization", 403);
    }
  } else {
    // Fallback: get the user's first org
    const { data } = await sb
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    membership = data;
    if (!membership) {
      return errorResponse("No organization found for user", 403);
    }
  }

  return {
    orgId: membership.org_id,
    userId: user.id,
    role: membership.role as TenantContext["role"],
    isServiceCall: false,
  };
}

/**
 * Require a minimum role for the operation.
 * Returns an error Response if the role is insufficient, or null if OK.
 */
export function requireRole(
  ctx: TenantContext,
  minRole: "member" | "admin" | "owner",
): Response | null {
  const hierarchy = { member: 0, admin: 1, owner: 2 };
  if (hierarchy[ctx.role] < hierarchy[minRole]) {
    return errorResponse(`Requires ${minRole} role`, 403);
  }
  return null;
}
