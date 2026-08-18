import "server-only";

import { Pool, type PoolClient } from "pg";

/**
 * Direct PostgreSQL access for self-hosted installs (TODO.md §4).
 *
 * This exists alongside the Supabase client, not instead of it. Supabase
 * deployments keep talking to PostgREST; a self-hosted install has no
 * PostgREST, so the same queries have to reach PostgreSQL directly.
 *
 * `server-only` is not decoration here — the pool holds the database
 * credentials, and the security model of the compat layer rests entirely on
 * the browser being unable to open a connection or set the identity GUC.
 */

let pool: Pool | null = null;

/** True when this install is configured to talk to PostgreSQL directly. */
export function hasDirectDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Direct PostgreSQL access is only available " +
        "in self-hosted mode; Supabase installs use the Supabase client instead."
    );
  }

  pool = new Pool({
    connectionString,
    // Supabase requires TLS; a local container in the compose network does not
    // present a certificate at all, so demanding one would break the default
    // self-hosted setup.
    ssl: /supabase\.(co|com|net)/.test(connectionString)
      ? { rejectUnauthorized: true }
      : undefined,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // A pooled client can fail while idle (network drop, database restart).
  // Without a handler, pg emits this on the process and Node exits.
  pool.on("error", (error) => {
    console.error("[db] idle client error:", error.message);
  });

  return pool;
}

export type { PoolClient };
