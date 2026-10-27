// Backup/restore drill for self-hosted PostgreSQL (docs/backups.md), the
// realistic failure: the server is gone and the backup goes onto a new one.
//
//   DATABASE_URL=postgres://admin@host/db node tests/ops/restore-drill.mjs
//
// 1. Creates a scratch database on DATABASE_URL's server, migrates it and
//    seeds fictitious data (two tenants, tasks, a module, an API key).
// 2. Takes the backup the docs describe: roles (pg_dumpall --roles-only)
//    and the database (pg_dump -Fc), with PostgreSQL 17's own tools.
// 3. Starts a brand-new PostgreSQL 17 container and restores into it.
// 4. Checks the restored copy: no pending migrations and no checksum
//    errors, identical row counts and task contents, RLS still isolating
//    tenants, and new writes working (sequences and defaults).
// Everything it creates is removed. Needs Docker and a role that may
// CREATE DATABASE on DATABASE_URL's server. Never point it at production.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../../", import.meta.url));
const admin = process.env.DATABASE_URL;
assert.ok(admin, "DATABASE_URL (a disposable server) is required");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(admin).hostname), "The drill runs only against a local server");
const IMAGE = process.env.RESTORE_DRILL_IMAGE ?? "postgres:17-alpine";
const suffix = randomBytes(4).toString("hex");
const sourceName = `guidon_drill_${suffix}`;
const sourceUrl = Object.assign(new URL(admin), { pathname: `/${sourceName}` }).toString();
const work = mkdtempSync(path.join(os.tmpdir(), "guidon-restore-"));
const container = `guidon-restore-${suffix}`;
const targetPassword = randomBytes(12).toString("hex");
const timings = {};
const step = async (name, fn) => { const start = performance.now(); const value = await fn(); timings[name] = Math.round(performance.now() - start); console.log(`  ${name} (${timings[name]} ms)`); return value; };
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const pgTool = (tool, args, input) => {
  const result = spawnSync("docker", ["run", "--rm", "-i", "--network", "host", IMAGE, tool, ...args], { input, maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`${tool} failed: ${result.stderr.toString().slice(0, 2000)}`);
  return result.stdout;
};

const adminClient = new pg.Client({ connectionString: admin });
await adminClient.connect();
let target;
let failed = false;
try {
  await step("create and migrate the source database", async () => {
    await adminClient.query(`CREATE DATABASE ${sourceName}`);
    execFileSync(process.execPath, [path.join(root, "scripts/migrate.mjs")], { env: { ...process.env, DATABASE_URL: sourceUrl }, stdio: "pipe" });
  });

  const source = new pg.Client({ connectionString: sourceUrl });
  await source.connect();
  const ids = await step("seed two tenants", async () => {
    const tenants = [];
    for (const label of ["one", "two"]) {
      const user = (await source.query("INSERT INTO auth.users(email,encrypted_password,email_confirmed_at) VALUES($1,'x',now()) RETURNING id", [`${label}-${suffix}@guidon.example.test`])).rows[0].id;
      await source.query("BEGIN");
      await source.query("SET LOCAL ROLE authenticated");
      await source.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
      const org = (await source.query("INSERT INTO public.organizations(name,slug) VALUES($1,$1) RETURNING id", [`drill-${label}-${suffix}`])).rows[0].id;
      const project = (await source.query("INSERT INTO public.projects(organization_id,name,visibility) VALUES($1,$2,'private') RETURNING id", [org, `Drill ${label}`])).rows[0].id;
      await source.query("INSERT INTO public.tasks(project_id,title,description,status) SELECT $1, 'Drill ' || $2 || ' ' || g, 'Restored text ' || g, (ARRAY['todo','in_progress','done'])[1 + g % 3] FROM generate_series(1, 200) g", [project, label]);
      await source.query("COMMIT");
      tenants.push({ user, org, project });
    }
    await source.query("INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes) VALUES($1,'drill','guidon_drill',$2,'{tasks:read}')", [tenants[0].user, randomBytes(32).toString("hex")]);
    return tenants;
  });
  const snapshot = async (client) => {
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
    const counts = {};
    for (const table of tables) counts[table] = (await client.query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n;
    const digest = (await client.query("SELECT md5(string_agg(id::text || title || coalesce(description,'') || status || is_done::text, ',' ORDER BY id)) d FROM public.tasks")).rows[0].d;
    const policies = (await client.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'")).rows[0].n;
    const functions = (await client.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','auth')")).rows[0].n;
    return { counts, digest, policies, functions };
  };
  const before = await snapshot(source);
  await source.end();

  const backup = await step("back up roles and database (PostgreSQL 17 tools)", async () => {
    const roles = pgTool("pg_dumpall", ["--roles-only", "--dbname", admin]);
    const dump = pgTool("pg_dump", ["-Fc", "--dbname", sourceUrl]);
    writeFileSync(path.join(work, "roles.sql"), roles);
    writeFileSync(path.join(work, "guidon.dump"), dump);
    return { roles, dump, bytes: dump.length };
  });

  const port = await step("start a new, empty PostgreSQL 17 server", async () => {
    docker("run", "-d", "--rm", "--name", container, "-e", `POSTGRES_PASSWORD=${targetPassword}`, "-e", "POSTGRES_USER=postgres", "-p", "127.0.0.1::5432", IMAGE);
    const mapped = Number(docker("port", container, "5432/tcp").trim().split(":").pop());
    for (let i = 0; i < 60; i++) {
      const probe = new pg.Client({ connectionString: `postgresql://postgres:${targetPassword}@127.0.0.1:${mapped}/postgres` });
      try { await probe.connect(); await probe.query("SELECT 1"); await probe.end(); return mapped; } catch { await probe.end().catch(() => {}); await new Promise((resolve) => setTimeout(resolve, 500)); }
    }
    throw new Error("The new server did not start");
  });
  const targetAdmin = `postgresql://postgres:${targetPassword}@127.0.0.1:${port}/postgres`;
  const targetUrl = `postgresql://postgres:${targetPassword}@127.0.0.1:${port}/guidon`;

  await step("restore roles, then the database", async () => {
    // Roles first: the RLS policies are granted TO authenticated/anon/service_role.
    // The source's own login role may already exist on the new server; psql reports and continues.
    pgTool("psql", ["--dbname", targetAdmin, "--quiet", "--set", "ON_ERROR_STOP=0"], backup.roles);
    pgTool("psql", ["--dbname", targetAdmin, "--quiet", "-c", "CREATE DATABASE guidon"]);
    pgTool("pg_restore", ["--dbname", targetUrl, "--exit-on-error"], backup.dump);
  });

  target = new pg.Client({ connectionString: targetUrl });
  await target.connect();
  await step("verify the restored copy", async () => {
    const status = spawnSync(process.execPath, [path.join(root, "scripts/migrate.mjs"), "--status"], { env: { ...process.env, DATABASE_URL: targetUrl }, encoding: "utf8" });
    assert.equal(status.status, 0, `migrate --status failed:\n${status.stdout}\n${status.stderr}`);
    assert.match(status.stdout, /\b0 pending\b/, `Restored copy has pending migrations:\n${status.stdout}`);
    const after = await snapshot(target);
    assert.deepEqual(after.counts, before.counts, "Every table has the same number of rows");
    assert.equal(after.digest, before.digest, "Task contents are identical");
    assert.equal(after.policies, before.policies, "All RLS policies are restored");
    assert.equal(after.functions, before.functions, "All functions are restored");

    // RLS still isolates tenants, and writes work (defaults, triggers, sequences).
    const [one, two] = ids;
    await target.query("BEGIN");
    await target.query("SET LOCAL ROLE authenticated");
    await target.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: one.user, role: "authenticated" })]);
    assert.equal((await target.query("SELECT count(*)::int n FROM public.tasks WHERE project_id=$1", [one.project])).rows[0].n, 200, "A tenant sees its own tasks");
    assert.equal((await target.query("SELECT count(*)::int n FROM public.tasks WHERE project_id=$1", [two.project])).rows[0].n, 0, "…and none of the other tenant's");
    const created = (await target.query("INSERT INTO public.tasks(project_id,title) VALUES($1,'Written after restore') RETURNING id, status, is_done", [one.project])).rows[0];
    assert.ok(created.id && created.status && created.is_done === false, "New writes get their defaults and triggers");
    await target.query("ROLLBACK");
  });
  console.log(`\nRestore drill passed. Backup ${Math.round(backup.bytes / 1024)} KiB; timings (ms): ${JSON.stringify(timings)}`);
} catch (error) {
  failed = true;
  console.error("\nRestore drill FAILED:", error.message);
  process.exitCode = 1;
} finally {
  await target?.end().catch(() => {});
  try { docker("rm", "-f", container); } catch { /* not started */ }
  await adminClient.query(`DROP DATABASE IF EXISTS ${sourceName} WITH (FORCE)`).catch((error) => console.error("cleanup", error.message));
  await adminClient.end();
  rmSync(work, { recursive: true, force: true });
  if (!failed) console.log("Cleaned up: source database, new server, backup files.");
}
