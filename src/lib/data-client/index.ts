import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { compile, parseColumns, type Filter, type FilterOp, type OrderBy, type QuerySpec } from "./sql";

/**
 * One data-access API for both deployment modes.
 *
 * Almost every Server Action used to be written twice - a raw-SQL branch
 * under withUser() for self-hosted Postgres and a supabase-js branch for
 * Supabase - with the two kept in sync by hand. This client exposes the
 * supabase-js query-builder subset those branches actually use and runs it
 * against whichever backend is configured:
 *
 *   const db = await dataClient(access.userId);
 *   const { data, error } = await db
 *     .from("project_references")
 *     .delete()
 *     .eq("id", referenceId)
 *     .eq("project_id", projectId)
 *     .select("storage_path")
 *     .maybeSingle();
 *
 * - Self-hosted: compiled to one parameterized statement (./sql.ts) and run
 *   inside withUser(), i.e. under the caller's RLS identity - exactly what
 *   the hand-written branches did.
 * - Supabase: replayed onto the RLS-scoped supabase-js client (the cookie
 *   session by default; pass `supabase` for API-key routes).
 *
 * Both return `{ data, error }` with the same shapes, and errors carry the
 * Postgres SQLSTATE in `code` either way (see lib/db/errors.ts).
 *
 * Not covered, on purpose - keep writing these by hand: PostgREST embeds
 * (joins), RPCs, and multi-statement work that must be atomic (each awaited
 * query here is its own transaction in self-hosted mode).
 */

export interface DataError {
  code?: string;
  message: string;
  /** Postgres DETAIL (node-postgres `.detail`, PostgREST `.details`). */
  details?: string;
}

export interface DataResult<T> {
  data: T;
  error: DataError | null;
}

type Row = Record<string, unknown>;
/** Result row types - any object type, including interfaces (which lack an index signature). */
type Shape = object;
type Mode = "many" | "single" | "maybeSingle";

type Backend =
  | { kind: "sql"; userId: string }
  | { kind: "supabase"; client: () => Promise<SupabaseClient> };

function toDataError(error: unknown): DataError {
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: unknown; message?: unknown; detail?: unknown; details?: unknown };
    const details = e.detail ?? e.details;
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : String(error),
      details: typeof details === "string" && details ? details : undefined,
    };
  }
  return { message: String(error) };
}

class QueryBuilder<T extends Shape = Row> implements PromiseLike<DataResult<T[]>> {
  private spec: QuerySpec;

  constructor(
    private backend: Backend,
    table: string
  ) {
    this.spec = { table, op: "select", columns: ["*"], filters: [], order: [], limit: null, values: null };
  }

  // --- statement kind ---------------------------------------------------

  /** On a read: the columns to fetch. After insert/update/delete: the columns to return (RETURNING). */
  select<R extends Shape = T>(columns = "*"): QueryBuilder<R> {
    this.spec.columns = parseColumns(columns);
    return this as unknown as QueryBuilder<R>;
  }

  insert(values: Row | Row[]): this {
    this.spec.op = "insert";
    this.spec.values = Array.isArray(values) ? values : [values];
    this.spec.columns = null;
    return this;
  }

  update(patch: Row): this {
    this.spec.op = "update";
    this.spec.values = [patch];
    this.spec.columns = null;
    return this;
  }

  delete(): this {
    this.spec.op = "delete";
    this.spec.columns = null;
    return this;
  }

  // --- filters / modifiers ---------------------------------------------

  private filter(column: string, op: FilterOp, value: unknown): this {
    this.spec.filters.push({ column, op, value } satisfies Filter);
    return this;
  }

  eq(column: string, value: unknown) { return this.filter(column, "eq", value); }
  neq(column: string, value: unknown) { return this.filter(column, "neq", value); }
  gt(column: string, value: unknown) { return this.filter(column, "gt", value); }
  gte(column: string, value: unknown) { return this.filter(column, "gte", value); }
  lt(column: string, value: unknown) { return this.filter(column, "lt", value); }
  lte(column: string, value: unknown) { return this.filter(column, "lte", value); }
  like(column: string, pattern: string) { return this.filter(column, "like", pattern); }
  ilike(column: string, pattern: string) { return this.filter(column, "ilike", pattern); }
  in(column: string, values: readonly unknown[]) { return this.filter(column, "in", [...values]); }
  is(column: string, value: null | boolean) { return this.filter(column, "is", value); }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this {
    this.spec.order.push({ column, ascending: options.ascending ?? true, nullsFirst: options.nullsFirst } satisfies OrderBy);
    return this;
  }

  limit(count: number): this {
    this.spec.limit = count;
    return this;
  }

  // --- terminals ----------------------------------------------------------

  /** Exactly one row, or an error (code PGRST116, as supabase-js) for zero or several. */
  single(): Promise<DataResult<T | null>> {
    return this.execute("single") as Promise<DataResult<T | null>>;
  }

  /** Zero or one row; an error only for several. */
  maybeSingle(): Promise<DataResult<T | null>> {
    return this.execute("maybeSingle") as Promise<DataResult<T | null>>;
  }

  then<A = DataResult<T[]>, B = never>(
    onfulfilled?: ((value: DataResult<T[]>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return (this.execute("many") as Promise<DataResult<T[]>>).then(onfulfilled, onrejected);
  }

  private async execute(mode: Mode): Promise<DataResult<T[] | T | null>> {
    return this.backend.kind === "sql" ? this.executeSql(this.backend.userId, mode) : this.executeSupabase(mode);
  }

  private async executeSql(userId: string, mode: Mode): Promise<DataResult<T[] | T | null>> {
    let rows: T[];
    try {
      const { text, values } = compile(this.spec);
      const result = await withUser(userId, ({ query }) => query(text, values));
      rows = result.rows as T[];
    } catch (error) {
      return { data: mode === "many" ? [] : null, error: toDataError(error) };
    }

    // A mutation without .select() returns no rows - same as supabase-js.
    if (this.spec.op !== "select" && this.spec.columns === null) {
      return { data: mode === "many" ? [] : null, error: null };
    }
    if (mode === "many") return { data: rows, error: null };
    if (rows.length > 1) {
      return { data: null, error: { code: "PGRST116", message: `Expected at most one row, got ${rows.length}` } };
    }
    if (mode === "single" && rows.length === 0) {
      return { data: null, error: { code: "PGRST116", message: "Expected one row, got none" } };
    }
    return { data: rows[0] ?? null, error: null };
  }

  private async executeSupabase(mode: Mode): Promise<DataResult<T[] | T | null>> {
    if (this.backend.kind !== "supabase") throw new Error("unreachable");
    const spec = this.spec;
    const client = await this.backend.client();
    const table = client.from(spec.table);
    const columns = spec.columns?.join(", ");

    // PostgREST's builder types can't follow this dynamic chaining; the
    // runtime API is what matters and is exercised by every hosted action.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any;
    switch (spec.op) {
      case "select":
        q = table.select(columns ?? "*");
        break;
      case "insert":
        q = table.insert(spec.values!.length === 1 ? spec.values![0] : spec.values!);
        break;
      case "update":
        q = table.update(spec.values![0]);
        break;
      case "delete":
        q = table.delete();
        break;
    }
    for (const f of spec.filters) q = q[f.op](f.column, f.value);
    if (spec.op !== "select" && columns) q = q.select(columns);
    for (const o of spec.order) q = q.order(o.column, { ascending: o.ascending, nullsFirst: o.nullsFirst });
    if (spec.limit !== null) q = q.limit(spec.limit);
    if (mode === "single") q = q.single();
    if (mode === "maybeSingle") q = q.maybeSingle();

    const { data, error } = await q;
    if (error) return { data: mode === "many" ? [] : null, error: toDataError(error) };
    if (spec.op !== "select" && !columns) return { data: mode === "many" ? [] : null, error: null };
    return { data: (data ?? (mode === "many" ? [] : null)) as T[] | T | null, error: null };
  }
}

export interface DataClient {
  from<T extends Shape = Row>(table: string): QueryBuilder<T>;
}

/**
 * Data client acting as `userId`. In Supabase mode the queries run on
 * `supabase` (defaults to the request's cookie-session client - pass
 * getApiUserClient(userId) from API-key routes); in self-hosted mode they
 * run under withUser(userId).
 */
export function dataClient(
  userId: string,
  options: { supabase?: () => Promise<SupabaseClient> } = {}
): DataClient {
  const backend: Backend = hasDirectDatabase()
    ? { kind: "sql", userId }
    : { kind: "supabase", client: options.supabase ?? (createClient as () => Promise<SupabaseClient>) };

  return {
    from<T extends Shape = Row>(table: string) {
      return new QueryBuilder<T>(backend, table);
    },
  };
}

export type { QueryBuilder };
