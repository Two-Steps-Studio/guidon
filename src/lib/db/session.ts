import "server-only";

import { getPool, type PoolClient } from "./pool";

/**
 * The application half of the Supabase compatibility layer
 * (see src/db/bootstrap/000_auth_compat.sql).
 *
 * On Supabase, PostgREST verifies a JWT and exposes its claims to PostgreSQL
 * as the `request.jwt.claims` GUC. Every one of the 70 RLS policies reads that
 * GUC through `auth.uid()`. Connecting to a plain PostgreSQL with `pg` skips
 * PostgREST entirely, so nothing sets the GUC and `auth.uid()` returns NULL —
 * which makes every policy deny, silently and uniformly.
 *
 * This module is what sets it, and it is the reason the compat layer is safe:
 * the identity is asserted by server code that already knows who the user is,
 * over a connection the browser cannot reach.
 *
 *
 * WHY THE TRANSACTION IS NOT OPTIONAL
 * -----------------------------------
 * Both the role and the claims are scoped with LOCAL, so they are undone when
 * the transaction ends. A pooled connection is handed to the next request with
 * no residue. Setting either one outside a transaction would leak one user's
 * identity into whichever request picked up that connection next.
 */

/**
 * Roles the compat layer defines. This is a closed set on purpose: the role
 * name is interpolated into `SET LOCAL ROLE`, which PostgreSQL will not accept
 * as a bind parameter. Nothing derived from a request may ever reach it.
 */
const DB_ROLES = ["anon", "authenticated", "service_role"] as const;
type DbRole = (typeof DB_ROLES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DbSession = {
  /** Runs a query inside the caller's identity. */
  query: PoolClient["query"];
};

async function withSession<T>(
  role: DbRole,
  claims: Record<string, unknown> | null,
  fn: (session: DbSession) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    // Claims go in first, while the connection still has its own privileges,
    // and as a bind parameter so the payload can never be read as SQL.
    // `true` is the is_local flag — this is the whole leak-prevention story.
    if (claims) {
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claims),
      ]);
    }

    // Safe to interpolate: `role` is one of three compile-time constants,
    // re-checked below so a cast at a call site cannot smuggle anything past.
    if (!DB_ROLES.includes(role)) {
      throw new Error(`Refusing to switch to unknown database role: ${role}`);
    }
    await client.query(`SET LOCAL ROLE ${role}`);

    const result = await fn({ query: client.query.bind(client) });

    await client.query("COMMIT");
    return result;
  } catch (error) {
    // If the connection itself died, ROLLBACK will fail too. The original
    // error is what the caller needs, so the rollback failure is swallowed.
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection is already unusable; release() below discards it */
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` as the given user. `auth.uid()` returns `userId` for the duration,
 * so every RLS policy behaves exactly as it does on Supabase.
 */
export function withUser<T>(
  userId: string,
  fn: (session: DbSession) => Promise<T>
): Promise<T> {
  // A malformed id would make auth.uid() return NULL, turning an authorisation
  // bug into a silent empty result set. Failing loudly is the safer outcome.
  if (!UUID_RE.test(userId)) {
    throw new Error("withUser requires a UUID user id");
  }

  return withSession("authenticated", { sub: userId, role: "authenticated" }, fn);
}

/**
 * Runs `fn` with RLS bypassed — migrations, background jobs, webhooks and the
 * admin panel (TODO.md §25). Never reachable from a user request path.
 *
 * Both halves of the service identity are asserted: the `service_role` database
 * role carries BYPASSRLS, while the JWT claim is what `private.is_service_role()`
 * from migration 006 actually reads.
 */
export function withServiceRole<T>(
  fn: (session: DbSession) => Promise<T>
): Promise<T> {
  return withSession("service_role", { role: "service_role" }, fn);
}

/**
 * Runs `fn` with no identity at all. Everything user-scoped is invisible —
 * useful for health checks and for asserting that a table really is protected.
 */
export function withAnon<T>(fn: (session: DbSession) => Promise<T>): Promise<T> {
  return withSession("anon", null, fn);
}
