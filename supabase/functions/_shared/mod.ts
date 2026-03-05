// Shared multi-tenant modules for all edge functions
//
// Usage in an edge function:
//   import { resolveTenantContext, CredentialManager, TenantQuery } from "../_shared/mod.ts";

export {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  errorResponse,
  resolveTenantContext,
  requireRole,
} from "./auth.ts";
export type { TenantContext } from "./auth.ts";

export { CredentialManager } from "./credentials.ts";
export type { Credential, CredentialType, Provider } from "./credentials.ts";

export { TenantQuery } from "./tenant-query.ts";

export { checkRateLimit } from "./rate-limiter.ts";
