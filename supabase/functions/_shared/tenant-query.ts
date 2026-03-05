import { getServiceClient } from "./auth.ts";
import type { TenantContext } from "./auth.ts";

/**
 * TenantQuery — Scoped query builder that guarantees org_id filtering.
 *
 * Every query via this class is automatically filtered by the tenant's org_id.
 * This prevents accidental cross-tenant data leaks when using the service role client.
 *
 * Usage:
 *   const tq = new TenantQuery(ctx);
 *   const agents = await tq.select("agents", "id, name, status");
 *   const run = await tq.insert("runs", { status: "running", agent_id: "..." });
 */
export class TenantQuery {
  private sb: ReturnType<typeof getServiceClient>;
  private orgId: string;

  constructor(ctx: TenantContext | string) {
    this.sb = getServiceClient();
    this.orgId = typeof ctx === "string" ? ctx : ctx.orgId;
  }

  /**
   * SELECT with automatic org_id filter.
   */
  async select<T = any>(
    table: string,
    columns = "*",
    filters?: Record<string, unknown>,
    options?: { limit?: number; order?: { column: string; ascending?: boolean } },
  ): Promise<{ data: T[] | null; error: any }> {
    let query = this.sb
      .from(table)
      .select(columns)
      .eq("org_id", this.orgId);

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (key === "org_id") continue; // already set
        query = query.eq(key, value);
      }
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true,
      });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    return { data: data as T[] | null, error };
  }

  /**
   * SELECT a single row with automatic org_id filter.
   */
  async selectOne<T = any>(
    table: string,
    columns = "*",
    filters?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: any }> {
    let query = this.sb
      .from(table)
      .select(columns)
      .eq("org_id", this.orgId);

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (key === "org_id") continue;
        query = query.eq(key, value);
      }
    }

    const { data, error } = await query.single();
    return { data: data as T | null, error };
  }

  /**
   * INSERT with automatic org_id injection.
   */
  async insert<T = any>(
    table: string,
    row: Record<string, unknown>,
  ): Promise<{ data: T | null; error: any }> {
    const { data, error } = await this.sb
      .from(table)
      .insert({ ...row, org_id: this.orgId })
      .select()
      .single();
    return { data: data as T | null, error };
  }

  /**
   * UPDATE with automatic org_id filter.
   */
  async update(
    table: string,
    values: Record<string, unknown>,
    filters: Record<string, unknown>,
  ): Promise<{ error: any }> {
    let query = this.sb
      .from(table)
      .update(values)
      .eq("org_id", this.orgId);

    for (const [key, value] of Object.entries(filters)) {
      if (key === "org_id") continue;
      query = query.eq(key, value);
    }

    const { error } = await query;
    return { error };
  }

  /**
   * UPSERT with automatic org_id injection.
   */
  async upsert(
    table: string,
    row: Record<string, unknown>,
    onConflict?: string,
  ): Promise<{ data: any; error: any }> {
    const opts = onConflict ? { onConflict } : undefined;
    const { data, error } = await this.sb
      .from(table)
      .upsert({ ...row, org_id: this.orgId }, opts)
      .select()
      .single();
    return { data, error };
  }

  /**
   * DELETE with automatic org_id filter.
   */
  async delete(
    table: string,
    filters: Record<string, unknown>,
  ): Promise<{ error: any }> {
    let query = this.sb
      .from(table)
      .delete()
      .eq("org_id", this.orgId);

    for (const [key, value] of Object.entries(filters)) {
      if (key === "org_id") continue;
      query = query.eq(key, value);
    }

    const { error } = await query;
    return { error };
  }

  /**
   * COUNT with automatic org_id filter.
   */
  async count(
    table: string,
    filters?: Record<string, unknown>,
  ): Promise<number> {
    let query = this.sb
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("org_id", this.orgId);

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (key === "org_id") continue;
        query = query.eq(key, value);
      }
    }

    const { count } = await query;
    return count ?? 0;
  }

  /**
   * Get the raw Supabase client for edge cases that need custom queries.
   * The caller is responsible for adding org_id filters.
   */
  get raw() {
    return this.sb;
  }

  get tenantOrgId() {
    return this.orgId;
  }
}
