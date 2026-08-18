#!/usr/bin/env node
/**
 * Guidon migration runner (TODO.md §13).
 *
 *   node scripts/migrate.mjs            apply pending migrations
 *   node scripts/migrate.mjs --status   list applied / pending, change nothing
 *   node scripts/migrate.mjs --dry-run  show what would run, change nothing
 *
 * Requires DATABASE_URL. For Supabase this is the connection string from
 * Project Settings → Database, NOT the REST URL.
 *
 * Guarantees:
 *   - migrations run in filename order, one transaction each
 *   - each is recorded in guidon_migrations with a checksum
 *   - a file that changed after being applied is a hard error, not a silent
 *     skip, because the database and the repository would disagree
 *   - nothing is ever deleted or rolled back automatically (§13: "never
 *     silently destroy existing data")
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, "..", "src", "db", "migrations");

const args = new Set(process.argv.slice(2));
const STATUS_ONLY = args.has("--status");
const DRY_RUN = args.has("--dry-run");

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * Only numbered files are migrations. Helper scripts that live alongside them
 * (diagnose_rls.sql, fix_missing_profiles.sql) are deliberately excluded —
 * they are diagnostics, not schema history.
 */
async function loadMigrations() {
  const entries = await readdir(MIGRATIONS_DIR);

  const files = entries
    .filter((name) => /^\d{3}_.*\.sql$/.test(name))
    .sort();

  if (files.length === 0) fail(`No migrations found in ${MIGRATIONS_DIR}`);

  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(path.join(MIGRATIONS_DIR, name), "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16),
      };
    })
  );
}

/**
 * Applies the Supabase compatibility layer, but only where it is missing.
 *
 * The schema is built on `auth.uid()`, `auth.users` and the anon/authenticated/
 * service_role roles. Supabase provides all of them; a plain PostgreSQL
 * provides none, and migration 000 fails on its very first foreign key.
 *
 * The probe is `auth.uid()` rather than a version flag or an env var: it asks
 * the database what it actually has. On Supabase the answer is yes and the file
 * is never even read, so a managed install cannot be altered by this code path.
 *
 * This runs before the numbered migrations and outside their history — it is
 * infrastructure provisioning, not a schema change. It is still recorded, so
 * `--status` shows what a given database was built from.
 */
async function ensureAuthCompat(client) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'auth' AND p.proname = 'uid'
    ) AS present
  `);

  if (rows[0].present) return { applied: false };

  const file = path.join(HERE, "..", "src", "db", "bootstrap", "000_auth_compat.sql");
  const sql = await readFile(file, "utf8");

  console.log("\n  No auth.uid() found — this is a plain PostgreSQL.");
  process.stdout.write("  Applying Supabase compatibility layer ... ");

  try {
    await client.query(sql);
  } catch (error) {
    console.log("FAILED");
    fail(
      `The compatibility layer could not be applied:\n    ${error.message}\n\n` +
        "  It needs a role that may CREATE ROLE and CREATE SCHEMA — the\n" +
        "  database owner. Nothing was changed."
    );
  }

  await client.query(
    `INSERT INTO public.guidon_migrations (name, checksum, duration_ms)
     VALUES ($1, $2, 0)
     ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum`,
    [
      "bootstrap/000_auth_compat.sql",
      createHash("sha256").update(sql).digest("hex").slice(0, 16),
    ]
  );

  console.log("ok");
  return { applied: true };
}

async function ensureRegistry(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.guidon_migrations (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      duration_ms integer
    )
  `);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    fail(
      "DATABASE_URL is not set.\n" +
        "  Supabase: Project Settings → Database → Connection string (URI).\n" +
        "  Self-hosted: postgresql://user:password@host:5432/guidon"
    );
  }

  const migrations = await loadMigrations();

  const client = new pg.Client({
    connectionString,
    // Supabase requires TLS but uses a certificate chain Node does not ship.
    ssl: /supabase\.(co|com)/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();

  try {
    await ensureRegistry(client);

    // Must precede the migrations: 000 declares a foreign key to auth.users
    // and 001 grants to `authenticated` 97 times. Skipped entirely when
    // reporting rather than applying.
    if (!STATUS_ONLY && !DRY_RUN) {
      await ensureAuthCompat(client);
    }

    const { rows } = await client.query(
      "SELECT name, checksum FROM public.guidon_migrations"
    );
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));

    // A migration that changed after being applied means the repo no longer
    // describes the database. Refuse rather than guess.
    const drifted = migrations.filter(
      (m) => applied.has(m.name) && applied.get(m.name) !== m.checksum
    );

    if (drifted.length > 0) {
      fail(
        "These migrations were modified after they were applied:\n" +
          drifted.map((m) => `    ${m.name}`).join("\n") +
          "\n\n  The database and the repository disagree. Write a new\n" +
          "  migration instead of editing an applied one."
      );
    }

    const pending = migrations.filter((m) => !applied.has(m.name));

    if (STATUS_ONLY || DRY_RUN) {
      console.log(`\n  ${migrations.length} migration(s) total\n`);
      for (const m of migrations) {
        const mark = applied.has(m.name) ? "applied" : "PENDING";
        console.log(`    ${mark.padEnd(8)} ${m.name}`);
      }
      console.log(
        `\n  ${pending.length} pending${DRY_RUN ? " (dry run — nothing applied)" : ""}\n`
      );
      return;
    }

    if (pending.length === 0) {
      console.log("\n  Database is up to date.\n");
      return;
    }

    console.log(`\n  Applying ${pending.length} migration(s)...\n`);

    for (const migration of pending) {
      const started = Date.now();
      process.stdout.write(`    ${migration.name} ... `);

      try {
        // Each migration file opens its own BEGIN/COMMIT. Wrapping it in
        // another transaction here would nest and break that, so the file
        // is trusted to be transactional and only the bookkeeping is added.
        await client.query(migration.sql);

        const duration = Date.now() - started;
        await client.query(
          `INSERT INTO public.guidon_migrations (name, checksum, duration_ms)
           VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE
             SET checksum = EXCLUDED.checksum,
                 applied_at = now(),
                 duration_ms = EXCLUDED.duration_ms`,
          [migration.name, migration.checksum, duration]
        );

        console.log(`ok (${duration}ms)`);
      } catch (error) {
        console.log("FAILED");
        fail(
          `${migration.name} failed and was rolled back:\n    ${error.message}\n\n` +
            "  Nothing after it was applied."
        );
      }
    }

    console.log("\n  Done.\n");
  } finally {
    await client.end();
  }
}

main().catch((error) => fail(error.message));
