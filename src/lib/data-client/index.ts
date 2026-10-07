import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole, withUser } from "@/lib/db/session";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { compile, compileCount, compileRpc, parseColumns, type Filter, type FilterOp, type OrderBy, type QuerySpec } from "./sql";

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
 * RPCs to `public` functions go through `rpc` (scalar/void result) or
 * `rpcRows` (TABLE / SETOF result), the same split supabase-js makes by
 * return type.
 *
 * Not covered, on purpose - keep writing these by hand: PostgREST embeds
 * (joins) and multi-statement work that must be atomic (each awaited query
 * here is its own transaction in self-hosted mode).
 */

export interface DataError {
  code?: string;
  message: string;
}

export interface DataResult<T> {
  data: T;
  error: DataError | null;
}

type Row = Record<string, unknown>;
/** Result row types - any object type, including interfaces (which lack an index signature). */
type Shape = object;
type Mode = "many" | "single" | "maybeSingle";

/** Runs one statement in a session - withUser(id) or withServiceRole. */
type SqlRunner = (text: string, values: unknown[]) => Promise<{ rows: unknown[] }>;

type Backend =
  | { kind: "sql"; run: SqlRunner }
  | { kind: "supabase"; client: () => Promise<SupabaseClient> };

function toDataError(error: unknown): DataError {
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: unknown; message?: unknown };
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : String(error),
    };
  }
  return { message: String(error) };
}

/** Replays filters onto a supabase-js builder; `isNot` is its `.not(col, "is", v)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js builder, see executeSupabase
function applyFilters(q: any, filters: Filter[]): any {
  for (const f of filters) q = f.op === "isNot" ? q.not(f.column, "is", f.value) : q[f.op](f.column, f.value);
  return q;
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
  /** supabase-js's `.not(column, "is", value)`. */
  isNot(column: string, value: null | boolean) { return this.filter(column, "isNot", value); }

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

  /** How many rows match the filters (columns, order and limit are ignored). */
  async count(): Promise<DataResult<number>> {
    if (this.backend.kind === "sql") {
      try {
        const { text, values } = compileCount(this.spec);
        const result = await this.backend.run(text, values);
        return { data: (result.rows[0] as { count: number }).count, error: null };
      } catch (error) {
        return { data: 0, error: toDataError(error) };
      }
    }
    const client = await this.backend.client();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same dynamic chaining as executeSupabase
    let q: any = client.from(this.spec.table).select("*", { count: "exact", head: true });
    q = applyFilters(q, this.spec.filters);
    const { count, error } = await q;
    return error ? { data: 0, error: toDataError(error) } : { data: count ?? 0, error: null };
  }

  then<A = DataResult<T[]>, B = never>(
    onfulfilled?: ((value: DataResult<T[]>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return (this.execute("many") as Promise<DataResult<T[]>>).then(onfulfilled, onrejected);
  }

  private async execute(mode: Mode): Promise<DataResult<T[] | T | null>> {
    return this.backend.kind === "sql" ? this.executeSql(this.backend.run, mode) : this.executeSupabase(mode);
  }

  private async executeSql(run: SqlRunner, mode: Mode): Promise<DataResult<T[] | T | null>> {
    let rows: T[];
    try {
      const { text, values } = compile(this.spec);
      const result = await run(text, values);
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
    q = applyFilters(q, spec.filters);
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
  /** A scalar or void `public` function; `data` is its return value (null for void). */
  rpc<V = unknown>(fn: string, args?: Record<string, unknown>): Promise<DataResult<V | null>>;
  /** A TABLE / SETOF `public` function; `data` is its rows. */
  rpcRows<T extends Shape = Row>(fn: string, args?: Record<string, unknown>): Promise<DataResult<T[]>>;
  /**
   * Insert-or-update one row identified by `key` (the unique columns),
   * WITHOUT `INSERT ... ON CONFLICT DO UPDATE`. That form - and supabase-js's
   * .upsert(), which emits it - reads `EXCLUDED.<col>`, which needs a SELECT
   * grant; the encrypted secret columns (025/035) deliberately have none for
   * `authenticated`, so an upsert of them always failed with "permission
   * denied". This updates `set` where `key` matches, inserts
   * `key + set + insertOnly` when nothing matched, and retries the update
   * once if a concurrent first save won the insert. `data` says which happened.
   */
  upsertRow(
    table: string,
    row: { key: Row; set: Row; insertOnly?: Row }
  ): Promise<DataResult<"updated" | "inserted" | null>>;
}

async function upsertRow(
  client: Pick<DataClient, "from">,
  table: string,
  { key, set, insertOnly = {} }: { key: Row; set: Row; insertOnly?: Row }
): Promise<DataResult<"updated" | "inserted" | null>> {
  const keyColumns = Object.keys(key);
  if (keyColumns.length === 0) throw new Error("data-client: upsertRow needs at least one key column");
  const update = () => {
    let q = client.from(table).update(set);
    for (const column of keyColumns) q = q.eq(column, key[column]);
    return q.select(keyColumns.join(", "));
  };

  const updated = await update();
  if (updated.error) return { data: null, error: updated.error };
  if (updated.data.length > 0) return { data: "updated", error: null };

  const inserted = await client.from(table).insert({ ...insertOnly, ...key, ...set }).select(keyColumns.join(", "));
  if (!inserted.error) return { data: "inserted", error: null };
  if (inserted.error.code === "23505") {
    const retry = await update();
    if (!retry.error && retry.data.length > 0) return { data: "updated", error: null };
  }
  return { data: null, error: inserted.error };
}

async function runRpc(
  backend: Backend,
  fn: string,
  args: Record<string, unknown>,
  shape: "value" | "rows"
): Promise<DataResult<unknown>> {
  const empty = shape === "rows" ? [] : null;
  if (backend.kind === "sql") {
    try {
      const { text, values } = compileRpc(fn, args, shape);
      const result = await backend.run(text, values);
      const first = result.rows[0] as { value?: unknown } | undefined;
      return { data: shape === "rows" ? result.rows : (first?.value ?? null), error: null };
    } catch (error) {
      return { data: empty, error: toDataError(error) };
    }
  }
  const client = await backend.client();
  const { data, error } = await client.rpc(fn, args);
  if (error) return { data: empty, error: toDataError(error) };
  // PostgREST returns "" for a void function - same as the SQL branch's null.
  if (shape === "rows") return { data: Array.isArray(data) ? data : data == null ? [] : [data], error: null };
  return { data: data === "" ? null : (data ?? null), error: null };
}

function clientFor(backend: Backend): DataClient {
  const from = <T extends Shape = Row>(table: string) => new QueryBuilder<T>(backend, table);
  return {
    from,
    upsertRow(table, row) {
      return upsertRow({ from }, table, row);
    },
    rpc<V = unknown>(fn: string, args: Record<string, unknown> = {}) {
      return runRpc(backend, fn, args, "value") as Promise<DataResult<V | null>>;
    },
    rpcRows<T extends Shape = Row>(fn: string, args: Record<string, unknown> = {}) {
      return runRpc(backend, fn, args, "rows") as Promise<DataResult<T[]>>;
    },
  };
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
  return clientFor(
    hasDirectDatabase()
      ? { kind: "sql", run: (text, values) => withUser(userId, ({ query }) => query(text, values)) }
      : { kind: "supabase", client: options.supabase ?? (createClient as () => Promise<SupabaseClient>) }
  );
}

/**
 * Data client with RLS bypassed: withServiceRole() self-hosted,
 * createServiceClient() on Supabase. Same rule as those two - only where
 * the code has already decided the caller may do this (admin panel,
 * webhooks, notifications fan-out, cleanup that follows an authorized
 * action) and a comment at the call site says why. Never for reads or
 * writes that should simply follow the caller's own permissions.
 */
export function serviceDataClient(): DataClient {
  return clientFor(
    hasDirectDatabase()
      ? { kind: "sql", run: (text, values) => withServiceRole(({ query }) => query(text, values)) }
      : { kind: "supabase", client: async () => createServiceClient() as unknown as SupabaseClient }
  );
}

export type { QueryBuilder };
