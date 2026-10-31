#!/usr/bin/env node
/**
 * Proves the schema works on a plain PostgreSQL - no Supabase, no Docker.
 *
 *   npm run test:db
 *
 * PGlite is real PostgreSQL compiled to WebAssembly, so this is not a
 * simulation: the same DDL, the same 70 RLS policies, the same triggers.
 * It runs in a couple of seconds on a laptop, which is what makes it
 * practical to run after every schema change (TODO.md §13, §29 faza 8).
 *
 * What it covers:
 *   1. the compat bootstrap plus every migration applies to an empty database
 *   2. auth.uid() resolves identity the way PostgREST would
 *   3. RLS actually isolates users from one another
 *   4. a pooled connection carries no identity between requests
 *   5. service_role behaves like Supabase's service key
 *
 * Two known deviations from a production PostgreSQL, neither affecting the
 * result: PGlite ships no pgcrypto (gen_random_uuid is built in since PG13
 * and the schema uses no other pgcrypto function), and it serves a single
 * connection - which makes it the strictest possible test for §4, since any
 * identity residue would be inherited immediately by the next transaction.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { installCatalogModule } from "../../src/lib/work/module-installation.ts";
import { moduleManifestSchema } from "../../src/lib/work/module-manifest.ts";
import { parseModuleRecords } from "../../src/lib/work/module-records.ts";
import { PROJECT_CAPABILITIES } from "../../src/lib/project-permissions.ts";
import { register } from "node:module";
// The data client's SQL compiler (pure TS, no imports) - run with
// --experimental-strip-types, see package.json's test:db.
import { compile, compileCount, compileRpc, parseColumns } from "../../src/lib/data-client/sql.ts";

// module-legacy.ts imports its siblings without an extension (as the app's
// bundler expects); resolve those to .ts, like tests/module-*.test.mjs do.
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/lib/work/') && /^\\.\\/(module|custom)-[a-z-]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}`)}`, import.meta.url);
const { convertContentModule } = await import("../../src/lib/work/module-legacy.ts");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(HERE, "..", "..", "src", "db");

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n  ${title}`);
}

const db = new PGlite();

/** PGlite has no pgcrypto; nothing in the schema needs it beyond gen_random_uuid. */
const forPglite = (sql) =>
  sql.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, "SELECT 1;");

/** Mirrors src/lib/db/session.ts exactly - if that changes, change this too. */
async function withUser(userId, fn) {
  await db.exec("BEGIN");
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await db.exec("SET LOCAL ROLE authenticated");
  try {
    const value = await fn();
    await db.exec("COMMIT");
    return value;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function withServiceRole(fn) {
  await db.exec("BEGIN");
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "service_role" }),
  ]);
  await db.exec("SET LOCAL ROLE service_role");
  try {
    const value = await fn();
    await db.exec("COMMIT");
    return value;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

/** Mirrors src/lib/db/session.ts's withAnon - no identity at all. */
async function withAnon(fn) {
  await db.exec("BEGIN");
  await db.exec("SET LOCAL ROLE anon");
  try {
    const value = await fn();
    await db.exec("COMMIT");
    return value;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function expectRejected(label, run, pattern) {
  try {
    await run();
    check(label, false, "statement was accepted");
  } catch (error) {
    check(label, pattern.test(error.message), error.message);
  }
}

// ------------------------------------------------------------------
section("1. bootstrap + migracje na pustej bazie");

const bootstrapPath = path.join(DB_DIR, "bootstrap", "000_auth_compat.sql");
await db.exec(forPglite(await readFile(bootstrapPath, "utf8")));
check("warstwa zgodnosci zastosowana", true);

const migrations = (await readdir(path.join(DB_DIR, "migrations")))
  .filter((name) => /^\d{3}_.*\.sql$/.test(name))
  .sort();

for (const name of migrations) {
  try {
    await db.exec(forPglite(await readFile(path.join(DB_DIR, "migrations", name), "utf8")));
    check(name, true);
  } catch (error) {
    check(name, false, error.message);
console.log(`\n  ${pass} pass / ${fail} fail\n`);
    process.exit(1);
  }
}

for (const [label, sql, expected] of [
  // 22->24 tabel, 84->92 polityk: github_connections + organization_ai_settings
  // (021, 024), po 4 polityki kazda - stara wartosc nigdy nie zostala
  // zaktualizowana gdy te migracje wladowaly. 025 (funkcje SECURITY DEFINER +
  // zawezenie GRANT SELECT) nie dodaje ani tabel, ani polityk, wiec liczby
  // zostaja takie same. 24->25 tabel, 92->96 polityk: discord_integrations
  // (035), 4 polityki (select/insert/update/delete), ten sam wzorzec co
  // github_connections. 25->26 tabel, 96->99 polityk: task_attachments (041),
  // 3 polityki (select/insert/delete - brak update, zalacznik sie nie edytuje).
  // 26->27 tabel, 99->101 polityk: github_task_events (042), 2 polityki
  // (select/insert - wpis idempotencji sie nie edytuje ani nie usuwa).
  // 27->28 tabel, polityk bez zmian: stripe_webhook_events (043) - zero
  // polityk dla authenticated w ogole (jak subscriptions same nie maja
  // insert/update/delete), tylko GRANT dla service_role.
  // 28->29 tabel, 101->103 polityk: feedback (044), 2 polityki
  // (select/insert - kazdy widzi i wstawia tylko swoj wiersz, panel admina
  // czyta wszystko przez service_role, z pominieciem RLS).
  // 29->30 tabel, 103->106 polityk: notifications (045), 3 polityki
  // (select/update/delete - kazdy widzi/oznacza/usuwa tylko swoje wiersze;
  // zero polityk insert dla authenticated, wstawia wylacznie service_role).
  // 30->31 tabel, 106->110 polityk: project_references (048), 4 polityki
  // (select/insert/update/delete).
  // 31->32 tabel, 110->114 polityk: organization_webhooks (050), 4 polityki
  // (owner/admin organizacji).
  // 32->33 tabel, 114->118 polityk: project_label_presets (053), 4 polityki
  // 33->34 tabel, 118->122 polityk: discord_user_links (057), 4 polityki
  // 34->35 tabel, 122->124 polityk: ai_accounts (059) + profiles_select_ai_accounts
  // 35->36 tabel, 124->129 polityk: project_task_priorities (060, 4) + project_board_columns_delete
  // 36->38 tabel, polityk bez zmian: promo_codes + promo_redemptions (062) -
  // zero polityk, pisze i czyta tylko service_role (jak stripe_webhook_events).
  // 38->39 tabel, polityk bez zmian: mobile_auth_codes (068) - tylko service_role.
  // 39->40 tabel, 129->130 polityk: plan_prices (071) + plan_prices_select.
  // 40->41 tabel, polityk bez zmian: api_idempotency_keys (072) - tylko service_role.
  // 41->45 tabel, polityk bez zmian: oauth_clients/grants/codes/refresh_tokens (073) - tylko service_role.
  // 45->46 tabel, polityk bez zmian: api_jobs (075) - tylko service_role.
  // 46->47: shared replay protection for signed OAuth client assertions (078).
  // 47->48 and 130->133: project-scoped declarative module packages (080).
  // 53->54 and 138->139: context_events (090) + context_events_select.
  // 139->140: invitations_manager_select (091).
  // 54->57 and 140->143: module_listings, module_registry_events, module_reports (093), one read policy each.
  // 57->58 and 143->144: module_automation_runs (094) + module_automation_runs_select.
  // 58->59, policies unchanged: funnel_cta_counts (096) - service_role only.
  // 59->60 and 144->148: task_links (097) + select/insert/update/delete.
  // 60->61 and 148->149: task_claims (100) + task_claims_select.
  // 61->62 and 149->150: agent_approval_requests (102) + agent_approval_requests_select.
  // 62->63 and 150->151: agent_briefs (103) + agent_briefs_select.
  ["64 tabel", "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'", 64],
  ["151 polityk RLS", "SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'", 151],
]) {
  const { rows } = await db.query(sql);
  check(label, rows[0].n === expected, rows[0].n);
}

// ------------------------------------------------------------------
section("2. auth.uid()");

await withUser(A, async () => {
  const { rows } = await db.query("SELECT auth.uid() u, current_user cu");
  check("zwraca sub z JWT", rows[0].u === A, rows[0].u);
  check("rola zeszla do authenticated", rows[0].cu === "authenticated", rows[0].cu);
});

{
  const { rows } = await db.query("SELECT auth.uid() u");
  check("brak sesji -> NULL", rows[0].u === null, rows[0].u);
}

{
  await db.exec("BEGIN");
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", ["nie-json"]);
  const { rows } = await db.query("SELECT auth.uid() u");
  check("zepsute claims -> NULL, nie blad", rows[0].u === null, rows[0].u);
  await db.exec("COMMIT");
}

{
  await db.exec("BEGIN");
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
    `{"sub":"${A}"}'; SET ROLE service_role; --`,
  ]);
  const { rows } = await db.query("SELECT auth.uid() u, current_user cu");
  check(
    "zlosliwy ladunek nie eskaluje uprawnien",
    rows[0].u === null && rows[0].cu !== "service_role",
    JSON.stringify(rows[0])
  );
  await db.exec("COMMIT");
}

// ------------------------------------------------------------------
section("3. triggery tozsamosci");

for (const [id, email, fullName] of [
  [A, "a@example.test", "Anna"],
  [B, "b@example.test", "Bartek"],
]) {
  await db.query(
    "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)",
    [id, email, JSON.stringify({ full_name: fullName })]
  );
}

{
  const { rows } = await db.query(
    "SELECT full_name FROM public.profiles ORDER BY email"
  );
  check("profil powstaje automatycznie", rows.length === 2, rows.length);
  check("full_name z raw_user_meta_data", rows[0].full_name === "Anna", rows[0].full_name);
}

// ------------------------------------------------------------------
section("4. zapis pod RLS (INSERT ... RETURNING, migracja 009)");

let orgId;
let projectId;

await withUser(A, async () => {
  const org = await db.query(
    "INSERT INTO public.organizations (name, slug) VALUES ('Test','test') RETURNING id, created_by"
  );
  orgId = org.rows[0].id;
  check("organizacja z RETURNING", Boolean(orgId));
  check("created_by z triggera", org.rows[0].created_by === A, org.rows[0].created_by);

  const member = await db.query(
    "SELECT role FROM public.organization_members WHERE organization_id = $1",
    [orgId]
  );
  check("czlonkostwo owner z triggera", member.rows[0]?.role === "owner", JSON.stringify(member.rows));

  const project = await db.query(
    "INSERT INTO public.projects (organization_id, name) VALUES ($1,'Projekt A') RETURNING id, slug, created_by",
    [orgId]
  );
  projectId = project.rows[0].id;
  check("projekt z RETURNING", Boolean(projectId));
  check("slug z triggera (004)", project.rows[0].slug === "projekt-a", project.rows[0].slug);
  check("created_by projektu (006)", project.rows[0].created_by === A, project.rows[0].created_by);

  const task = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Zadanie') RETURNING id",
    [projectId]
  );
  check("zadanie z RETURNING", Boolean(task.rows[0].id));
});

// ------------------------------------------------------------------
section("5. izolacja miedzy uzytkownikami");

await withUser(A, async () => {
  const { rows } = await db.query("SELECT count(*)::int n FROM public.projects");
  check("A widzi swoj projekt", rows[0].n === 1, rows[0].n);
});

await withUser(B, async () => {
  const projects = await db.query("SELECT count(*)::int n FROM public.projects");
  check("B nie widzi projektu A", projects.rows[0].n === 0, projects.rows[0].n);

  const orgs = await db.query("SELECT count(*)::int n FROM public.organizations");
  check("B nie widzi organizacji A", orgs.rows[0].n === 0, orgs.rows[0].n);

  const tasks = await db.query("SELECT count(*)::int n FROM public.tasks");
  check("B nie widzi zadan A", tasks.rows[0].n === 0, tasks.rows[0].n);
});

await expectRejected(
  "B nie moze pisac do projektu A",
  () =>
    withUser(B, () =>
      db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1,'obce')", [projectId])
    ),
  /row-level security|violates/i
);

{
  await db.exec("BEGIN");
  await db.exec("SET LOCAL ROLE authenticated");
  const { rows } = await db.query("SELECT count(*)::int n FROM public.projects");
  check("sesja bez claims nie widzi nic", rows[0].n === 0, rows[0].n);
  await db.exec("COMMIT");
}

await expectRejected(
  "anon nie ma dostepu do projects",
  async () => {
    await db.exec("BEGIN");
    try {
      await db.exec("SET LOCAL ROLE anon");
      await db.query("SELECT count(*) FROM public.projects");
    } finally {
      await db.exec("ROLLBACK");
    }
  },
  /permission denied/i
);

await expectRejected(
  "authenticated nie czyta auth.users",
  () => withUser(A, () => db.query("SELECT count(*) FROM auth.users")),
  /permission denied/i
);

// ------------------------------------------------------------------
section("6. brak sladu tozsamosci na polaczeniu");

await withUser(A, () => db.query("SELECT 1"));
{
  const { rows } = await db.query("SELECT auth.uid() u, current_user cu");
  check("po COMMIT: uid wyczyszczone", rows[0].u === null, rows[0].u);
  check("po COMMIT: rola przywrocona", rows[0].cu !== "authenticated", rows[0].cu);
}

try {
  await withUser(A, () => db.query("SELECT 1/0"));
} catch {
  /* oczekiwane */
}
{
  const { rows } = await db.query("SELECT auth.uid() u, current_user cu");
  check("po ROLLBACK: uid wyczyszczone", rows[0].u === null, rows[0].u);
  check("po ROLLBACK: rola przywrocona", rows[0].cu !== "authenticated", rows[0].cu);
}

{
  const seen = [];
  for (const uid of [A, B, A]) {
    const { rows } = await withUser(uid, () => db.query("SELECT auth.uid() u"));
    seen.push(rows[0].u);
  }
  check(
    "kolejne sesje nie dziedzicza tozsamosci",
    JSON.stringify(seen) === JSON.stringify([A, B, A]),
    JSON.stringify(seen)
  );
}

// ------------------------------------------------------------------
section("7. service_role");

await withServiceRole(async () => {
  const { rows } = await db.query("SELECT count(*)::int n FROM public.organizations");
  check("widzi mimo braku czlonkostwa", rows[0].n === 1, rows[0].n);

  const project = await db.query(
    "INSERT INTO public.projects (organization_id, name, created_by) VALUES ($1,'SR',$2) RETURNING created_by",
    [orgId, A]
  );
  check("pisze z jawnym created_by", project.rows[0].created_by === A, project.rows[0].created_by);
});

await expectRejected(
  "odrzucony bez jawnego created_by (006)",
  () =>
    withServiceRole(() =>
      db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1,'Brak')", [orgId])
    ),
  /created_by/i
);

// ------------------------------------------------------------------
section("8. idempotencja warstwy zgodnosci");

try {
  await db.exec(forPglite(await readFile(bootstrapPath, "utf8")));
  const { rows } = await db.query("SELECT count(*)::int n FROM public.profiles");
  check("ponowne uruchomienie nie rusza danych", rows[0].n === 2, rows[0].n);
} catch (error) {
  check("ponowne uruchomienie nie rusza danych", false, error.message);
}

// ------------------------------------------------------------------
section("9. subtaski (migracja 010)");

let parentTaskId;
let subtaskId;

await withUser(A, async () => {
  const parent = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Rodzic') RETURNING id",
    [projectId]
  );
  parentTaskId = parent.rows[0].id;

  const subtask = await db.query(
    "INSERT INTO public.tasks (project_id, title, parent_task_id) VALUES ($1,'Subtask',$2) RETURNING id, parent_task_id",
    [projectId, parentTaskId]
  );
  subtaskId = subtask.rows[0].id;
  check(
    "subtask wskazuje rodzica",
    subtask.rows[0].parent_task_id === parentTaskId,
    subtask.rows[0].parent_task_id
  );
});

await expectRejected(
  "task nie moze byc wlasnym rodzicem",
  () =>
    withUser(A, () =>
      db.query("UPDATE public.tasks SET parent_task_id = id WHERE id = $1", [parentTaskId])
    ),
  /parent_task_id_not_self|check constraint/i
);

await withUser(B, async () => {
  const { rows } = await db.query(
    "SELECT count(*)::int n FROM public.tasks WHERE id = $1",
    [subtaskId]
  );
  check("B nie widzi subtaska A (te same polityki co tasks)", rows[0].n === 0, rows[0].n);
});

await withUser(A, async () => {
  await db.query("DELETE FROM public.tasks WHERE id = $1", [parentTaskId]);
  const { rows } = await db.query(
    "SELECT count(*)::int n FROM public.tasks WHERE id = $1",
    [subtaskId]
  );
  check("ON DELETE CASCADE usuwa subtask z rodzicem", rows[0].n === 0, rows[0].n);
});

// ------------------------------------------------------------------
section("10. context_relations.project_id (migracja 011)");

let taskOneId;
let taskTwoId;
let relationId;

await withUser(A, async () => {
  const t1 = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Relacja 1') RETURNING id",
    [projectId]
  );
  taskOneId = t1.rows[0].id;

  const t2 = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Relacja 2') RETURNING id",
    [projectId]
  );
  taskTwoId = t2.rows[0].id;

  const relation = await db.query(
    `INSERT INTO public.context_relations
       (source_type, source_id, target_type, target_id, relation_type, created_by)
     VALUES ('task', $1, 'task', $2, 'related_to', $3)
     RETURNING id, project_id`,
    [taskOneId, taskTwoId, A]
  );
  relationId = relation.rows[0].id;
  check(
    "project_id ustawiony triggerem z source, nie z inputu",
    relation.rows[0].project_id === projectId,
    relation.rows[0].project_id
  );
});

await withUser(B, async () => {
  const { rows } = await db.query(
    "SELECT count(*)::int n FROM public.context_relations WHERE id = $1",
    [relationId]
  );
  check("B nie widzi relacji A", rows[0].n === 0, rows[0].n);
});

let otherProjectId;
let otherTaskId;

await withUser(A, async () => {
  const project = await db.query(
    "INSERT INTO public.projects (organization_id, name) VALUES ($1,'Projekt B') RETURNING id",
    [orgId]
  );
  otherProjectId = project.rows[0].id;

  const task = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'W innym projekcie') RETURNING id",
    [otherProjectId]
  );
  otherTaskId = task.rows[0].id;
});

await expectRejected(
  "relacja nie moze przeciac projektow",
  () =>
    withUser(A, () =>
      db.query(
        `INSERT INTO public.context_relations
           (source_type, source_id, target_type, target_id, relation_type, created_by)
         VALUES ('task', $1, 'task', $2, 'related_to', $3)`,
        [taskOneId, otherTaskId, A]
      )
    ),
  /row-level security|violates/i
);

await withUser(A, async () => {
  await db.query("DELETE FROM public.context_relations WHERE id = $1", [relationId]);
  const { rows } = await db.query(
    "SELECT count(*)::int n FROM public.context_relations WHERE id = $1",
    [relationId]
  );
  check("owner moze usunac relacje", rows[0].n === 0, rows[0].n);
});

// ------------------------------------------------------------------
section("11. sprzatanie sierot context_relations (migracja 012)");

/**
 * Bypasses RLS deliberately: the old policy already masked orphans from a
 * normal user's view (entity_project_id() returns NULL for a deleted
 * entity, so the SELECT policy's IS NOT NULL check never passes). Counting
 * as service_role is what actually distinguishes "the trigger deleted the
 * row" from "RLS is merely hiding a row that is still physically there" -
 * the whole point of migration 012.
 */
async function countRelationAsServiceRole(relationId) {
  return withServiceRole(async () => {
    const { rows } = await db.query(
      "SELECT count(*)::int n FROM public.context_relations WHERE id = $1",
      [relationId]
    );
    return rows[0].n;
  });
}

// One source-side check per entity table - this is what actually exercises
// each of the six triggers individually. A copy-paste mistake in migration
// 012 (wrong table attached to a trigger, or the wrong TG_ARGV literal)
// would only be caught by testing every table, not just one.
const sourceSideCases = [
  {
    type: "task",
    insert: () =>
      db.query(
        "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Zrodlowy task') RETURNING id",
        [projectId]
      ),
    deleteEntity: (id) => db.query("DELETE FROM public.tasks WHERE id = $1", [id]),
  },
  {
    type: "phase",
    insert: () =>
      db.query(
        "INSERT INTO public.roadmap_phases (project_id, name) VALUES ($1,'Faza') RETURNING id",
        [projectId]
      ),
    deleteEntity: (id) => db.query("DELETE FROM public.roadmap_phases WHERE id = $1", [id]),
  },
  {
    type: "decision",
    insert: () =>
      db.query(
        "INSERT INTO public.context_decisions (project_id, title, made_by) VALUES ($1,'Decyzja',$2) RETURNING id",
        [projectId, A]
      ),
    deleteEntity: (id) => db.query("DELETE FROM public.context_decisions WHERE id = $1", [id]),
  },
  {
    type: "file",
    insert: () =>
      db.query(
        "INSERT INTO public.project_files (project_id, name, uploaded_by) VALUES ($1,'plik.txt',$2) RETURNING id",
        [projectId, A]
      ),
    deleteEntity: (id) => db.query("DELETE FROM public.project_files WHERE id = $1", [id]),
  },
  {
    type: "source",
    insert: () =>
      db.query(
        "INSERT INTO public.context_sources (project_id, source_type, title) VALUES ($1,'document','Zrodlo') RETURNING id",
        [projectId]
      ),
    deleteEntity: (id) => db.query("DELETE FROM public.context_sources WHERE id = $1", [id]),
  },
  {
    type: "memory",
    insert: () =>
      db.query(
        "INSERT INTO public.project_memory (project_id, content, memory_type, created_by) VALUES ($1,'Fakt','fact',$2) RETURNING id",
        [projectId, A]
      ),
    deleteEntity: (id) => db.query("DELETE FROM public.project_memory WHERE id = $1", [id]),
  },
];

for (const { type, insert, deleteEntity } of sourceSideCases) {
  await withUser(A, async () => {
    const anchor = await db.query(
      "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Kotwica') RETURNING id",
      [projectId]
    );
    const anchorId = anchor.rows[0].id;

    const entity = await insert();
    const entityId = entity.rows[0].id;

    const relation = await db.query(
      `INSERT INTO public.context_relations
         (source_type, source_id, target_type, target_id, relation_type, created_by)
       VALUES ($1, $2, 'task', $3, 'related_to', $4)
       RETURNING id`,
      [type, entityId, anchorId, A]
    );
    const relId = relation.rows[0].id;

    await deleteEntity(entityId);

    const remaining = await countRelationAsServiceRole(relId);
    check(`usuniecie '${type}' jako source kasuje relacje`, remaining === 0, remaining);
  });
}

// Target-side: the OR branch in cleanup_context_relations_on_delete(). Only
// one table needs covering here - the string-matching logic is identical
// regardless of which table's trigger fires it, unlike the source-side loop
// above where each table's trigger is a distinct, independently-wireable
// object in migration 012.
await withUser(A, async () => {
  const source = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Source') RETURNING id",
    [projectId]
  );
  const target = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Target') RETURNING id",
    [projectId]
  );

  const relation = await db.query(
    `INSERT INTO public.context_relations
       (source_type, source_id, target_type, target_id, relation_type, created_by)
     VALUES ('task', $1, 'task', $2, 'related_to', $3)
     RETURNING id`,
    [source.rows[0].id, target.rows[0].id, A]
  );
  const relId = relation.rows[0].id;

  await db.query("DELETE FROM public.tasks WHERE id = $1", [target.rows[0].id]);

  const remaining = await countRelationAsServiceRole(relId);
  check("usuniecie encji jako target kasuje relacje", remaining === 0, remaining);
});

// Negative control: deleting an unrelated task must not touch a relation
// that never referenced it - otherwise the WHERE clause could be too broad
// (e.g. matching on id alone regardless of source_type) and this whole
// section would pass for the wrong reason.
await withUser(A, async () => {
  const t1 = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'T1') RETURNING id",
    [projectId]
  );
  const t2 = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'T2') RETURNING id",
    [projectId]
  );
  const unrelated = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Niepowiazany') RETURNING id",
    [projectId]
  );

  const relation = await db.query(
    `INSERT INTO public.context_relations
       (source_type, source_id, target_type, target_id, relation_type, created_by)
     VALUES ('task', $1, 'task', $2, 'related_to', $3)
     RETURNING id`,
    [t1.rows[0].id, t2.rows[0].id, A]
  );
  const relId = relation.rows[0].id;

  await db.query("DELETE FROM public.tasks WHERE id = $1", [unrelated.rows[0].id]);

  const remaining = await countRelationAsServiceRole(relId);
  check("usuniecie niepowiazanej encji nie rusza relacji", remaining === 1, remaining);
});

// ------------------------------------------------------------------
section("12. auth.users jako sluzy self-hosted logowaniu (src/lib/auth/local-auth.ts)");

// signUpLocal() i signInLocal() dzialaja wylacznie przez withServiceRole() -
// nigdy pod tozsamoscia authenticated/anon - bo auth.users ma RLS wlaczone
// bez zadnej polityki (000_auth_compat.sql §3: "odmow wszystkim poza
// wlascicielem i BYPASSRLS"). Ta sekcja dowodzi, ze to zalozenie jest
// prawdziwe, nie zakladane.
let localUserId;

await withServiceRole(async () => {
  const inserted = await db.query(
    `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     VALUES ($1, $2, now(), $3::jsonb)
     RETURNING id`,
    ["local@example.test", "scrypt:aa:bb", JSON.stringify({ full_name: "Local User" })]
  );
  localUserId = inserted.rows[0].id;
  check("insert do auth.users jako service_role", Boolean(localUserId));

  const profile = await db.query("SELECT full_name FROM public.profiles WHERE id = $1", [
    localUserId,
  ]);
  check(
    "trigger tworzy profil tez dla insertu przez service_role",
    profile.rows[0]?.full_name === "Local User",
    JSON.stringify(profile.rows)
  );
});

await expectRejected(
  "duplikat email odrzucony (UNIQUE, jak sprawdza signUpLocal)",
  () =>
    withServiceRole(() =>
      db.query(
        "INSERT INTO auth.users (email, encrypted_password) VALUES ($1, $2)",
        ["local@example.test", "scrypt:cc:dd"]
      )
    ),
  /duplicate key|unique/i
);

await expectRejected(
  "authenticated nie moze czytac auth.users",
  () => withUser(A, () => db.query("SELECT 1 FROM auth.users WHERE id = $1", [localUserId])),
  /permission denied/i
);

await expectRejected(
  "anon nie moze czytac auth.users",
  () => withAnon(() => db.query("SELECT 1 FROM auth.users WHERE id = $1", [localUserId])),
  /permission denied/i
);

// ------------------------------------------------------------------
section("13. task_attempts - Previous Attempts (migracja 013)");

let attemptTaskId;
let attemptId;

await withUser(A, async () => {
  const task = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1,'Zadanie z probami') RETURNING id",
    [projectId]
  );
  attemptTaskId = task.rows[0].id;

  const attempt = await db.query(
    `INSERT INTO public.task_attempts
       (task_id, problem, approach, outcome, failure_reason, files_changed, created_by)
     VALUES ($1, 'Test timed out', 'Zwiekszono timeout do 30s', 'failed',
             'Root cause bylo deadlockowanie polaczen, nie za maly timeout',
             ARRAY['tests/db/compat.test.mjs'], $2)
     RETURNING id, outcome`,
    [attemptTaskId, A]
  );
  attemptId = attempt.rows[0].id;
  check("insert proby z RETURNING", Boolean(attemptId));
  check("outcome zapisany", attempt.rows[0].outcome === "failed", attempt.rows[0].outcome);
});

await expectRejected(
  "outcome poza dozwolonym zbiorem odrzucony",
  () =>
    withUser(A, () =>
      db.query(
        `INSERT INTO public.task_attempts (task_id, problem, approach, outcome, created_by)
         VALUES ($1, 'p', 'a', 'abandoned', $2)`,
        [attemptTaskId, A]
      )
    ),
  /violates check constraint/i
);

await withUser(B, async () => {
  const { rows } = await db.query("SELECT id FROM public.task_attempts WHERE id = $1", [attemptId]);
  check("B nie widzi proby A (RLS przez project_access taska)", rows.length === 0, rows.length);
});

await withUser(A, async () => {
  await db.query("DELETE FROM public.tasks WHERE id = $1", [attemptTaskId]);
});

const remainingAttempts = await withServiceRole(async () => {
  const { rows } = await db.query("SELECT count(*)::int n FROM public.task_attempts WHERE id = $1", [
    attemptId,
  ]);
  return rows[0].n;
});
check("ON DELETE CASCADE z tasks kasuje probe", remainingAttempts === 0, remainingAttempts);

// ------------------------------------------------------------------
section("14. project_limit - grant na poziomie kolumny (migracja 014)");

await withUser(A, async () => {
  const rename = await db.query(
    "UPDATE public.organizations SET name = $1 WHERE id = $2 RETURNING name",
    ["Test zmieniona", orgId]
  );
  check(
    "wlasciciel moze zmienic name (dozwolona kolumna)",
    rename.rows[0]?.name === "Test zmieniona",
    JSON.stringify(rename.rows)
  );
});

await expectRejected(
  "wlasciciel NIE moze zmienic project_limit (kolumna zarezerwowana dla service_role)",
  () =>
    withUser(A, () =>
      db.query("UPDATE public.organizations SET project_limit = 99 WHERE id = $1", [orgId])
    ),
  /permission denied/i
);

await withServiceRole(async () => {
  const updated = await db.query(
    "UPDATE public.organizations SET project_limit = 5 WHERE id = $1 RETURNING project_limit",
    [orgId]
  );
  check(
    "service_role moze podniesc project_limit",
    updated.rows[0]?.project_limit === 5,
    JSON.stringify(updated.rows)
  );
});

// ------------------------------------------------------------------
section("15. plans + subscriptions (migracja 015)");

await withServiceRole(async () => {
  const { rows } = await db.query("SELECT id, project_limit FROM public.plans ORDER BY sort_order");
  check(
    "5 planow zaseedowanych w kolejnosci",
    rows.length === 5 && rows.map((r) => r.id).join(",") === "free,pro,team,business,enterprise",
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const org = await db.query(
    "INSERT INTO public.organizations (name, slug) VALUES ('Sub Test','sub-test') RETURNING id, project_limit"
  );
  check(
    "nowa organizacja dostaje project_limit=2 (Free)",
    org.rows[0].project_limit === 2,
    org.rows[0].project_limit
  );

  const sub = await db.query(
    "SELECT plan_id, status FROM public.subscriptions WHERE organization_id = $1",
    [org.rows[0].id]
  );
  check(
    "nowa organizacja dostaje subskrypcje Free automatycznie",
    sub.rows[0]?.plan_id === "free" && sub.rows[0]?.status === "active",
    JSON.stringify(sub.rows)
  );

  await expectRejected(
    "wlasciciel NIE moze sam zmienic swojego planu",
    () =>
      db.query("UPDATE public.subscriptions SET plan_id = 'business' WHERE organization_id = $1", [
        org.rows[0].id,
      ]),
    /permission denied/i
  );
});

await withServiceRole(async () => {
  const { rows } = await db.query("SELECT count(*)::int n FROM public.subscriptions");
  check("service_role widzi subskrypcje", rows[0].n >= 1, rows[0].n);
});

// ------------------------------------------------------------------
section("16. AI Task API: status, permissions, api_keys (migracja 016)");

await withUser(A, async () => {
  const task = await db.query(
    "INSERT INTO public.tasks (project_id, title, status) VALUES ($1, 'AI task', 'ai_working') RETURNING id, status",
    [projectId]
  );
  check("ai_working jest dozwolonym statusem", task.rows[0].status === "ai_working", task.rows[0].status);

  const perms = await db.query(
    "INSERT INTO public.project_ai_permissions (project_id) VALUES ($1) RETURNING can_read_context, can_complete_tasks",
    [projectId]
  );
  check(
    "domyslne uprawnienia AI: read wl., complete wyl.",
    perms.rows[0].can_read_context === true && perms.rows[0].can_complete_tasks === false,
    JSON.stringify(perms.rows[0])
  );

  const key = await db.query(
    "INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'CI key', 'guidon_abcd', 'deadbeef', ARRAY['tasks:read']) RETURNING id, key_prefix"
    , [A]
  );
  check("klucz API utworzony", Boolean(key.rows[0].id), JSON.stringify(key.rows[0]));

  const revoke = await db.query(
    "UPDATE public.api_keys SET revoked_at = now() WHERE id = $1 RETURNING revoked_at",
    [key.rows[0].id]
  );
  check("wlasciciel moze odwolac wlasny klucz (revoked_at)", Boolean(revoke.rows[0].revoked_at));

  await expectRejected(
    "wlasciciel NIE moze zmienic scopes wlasnego klucza",
    () => db.query("UPDATE public.api_keys SET scopes = ARRAY['tasks:write'] WHERE id = $1", [key.rows[0].id]),
    /permission denied/i
  );
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT count(*)::int n FROM public.api_keys");
  check("B nie widzi kluczy API A", rows[0].n === 0, rows[0].n);
});

// ------------------------------------------------------------------
section("17. audyt RLS: braki GRANT na poziomie kolumny (migracja 017)");

await withUser(A, async () => {
  const rename = await db.query(
    "UPDATE public.projects SET name = $1 WHERE id = $2 RETURNING name",
    ["Projekt A zmieniony", projectId]
  );
  check(
    "owner projektu moze zmienic name (dozwolona kolumna)",
    rename.rows[0]?.name === "Projekt A zmieniony",
    JSON.stringify(rename.rows)
  );
});

await expectRejected(
  "owner projektu NIE moze przeniesc go do innej organizacji (organization_id)",
  () =>
    withUser(A, () =>
      db.query("UPDATE public.projects SET organization_id = gen_random_uuid() WHERE id = $1", [
        projectId,
      ])
    ),
  /permission denied/i
);

await expectRejected(
  "owner projektu NIE moze podszyc sie pod innego tworce (created_by)",
  () =>
    withUser(A, () =>
      db.query("UPDATE public.projects SET created_by = $1 WHERE id = $2", [B, projectId])
    ),
  /permission denied/i
);

await expectRejected(
  "owner projektu NIE moze zaktualizowac project_files (cala kolumna UPDATE odwolana)",
  () =>
    withUser(A, async () => {
      const file = await db.query(
        "INSERT INTO public.project_files (project_id, name, uploaded_by) VALUES ($1, 'a.txt', $2) RETURNING id",
        [projectId, A]
      );
      await db.query("UPDATE public.project_files SET name = 'b.txt' WHERE id = $1", [
        file.rows[0].id,
      ]);
    }),
  /permission denied/i
);

let inviteId;
await withServiceRole(async () => {
  const invite = await db.query(
    `INSERT INTO public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, 'ktos@example.test', 'member', repeat('0', 64), $2, now() + interval '7 days')
     RETURNING id`,
    [orgId, A]
  );
  inviteId = invite.rows[0].id;
});

await expectRejected(
  "admin organizacji NIE moze podniesc roli istniejacego zaproszenia przez UPDATE",
  () =>
    withUser(A, () =>
      db.query("UPDATE public.invitations SET role = 'owner' WHERE id = $1", [inviteId])
    ),
  /permission denied/i
);

await withUser(A, async () => {
  const source = await db.query(
    "INSERT INTO public.context_sources (project_id, source_type, title, author) VALUES ($1, 'document', 'Zrodlo', $2) RETURNING id",
    [projectId, A]
  );
  const updated = await db.query(
    "UPDATE public.context_sources SET title = $1 WHERE id = $2 RETURNING title",
    ["Zrodlo zmienione", source.rows[0].id]
  );
  check(
    "developer moze zmienic title zrodla (dozwolona kolumna)",
    updated.rows[0]?.title === "Zrodlo zmienione",
    JSON.stringify(updated.rows)
  );

  await expectRejected(
    "NIE mozna podszyc sie pod innego autora zrodla (author)",
    () => db.query("UPDATE public.context_sources SET author = $1 WHERE id = $2", [B, source.rows[0].id]),
    /permission denied/i
  );
});

await withUser(A, async () => {
  const decision = await db.query(
    "INSERT INTO public.context_decisions (project_id, title, made_by) VALUES ($1, 'Decyzja', $2) RETURNING id",
    [projectId, A]
  );

  await expectRejected(
    "NIE mozna podszyc sie pod innego autora decyzji (made_by)",
    () =>
      db.query("UPDATE public.context_decisions SET made_by = $1 WHERE id = $2", [
        B,
        decision.rows[0].id,
      ]),
    /permission denied/i
  );
});

// ------------------------------------------------------------------
section("18. avatar_url dla organizacji i projektow (migracja 018)");

await withUser(A, async () => {
  const org = await db.query(
    "UPDATE public.organizations SET avatar_url = $1 WHERE id = $2 RETURNING avatar_url",
    ["https://example.test/org.png", orgId]
  );
  check(
    "wlasciciel moze ustawic avatar_url organizacji",
    org.rows[0]?.avatar_url === "https://example.test/org.png",
    JSON.stringify(org.rows)
  );

  const project = await db.query(
    "UPDATE public.projects SET avatar_url = $1 WHERE id = $2 RETURNING avatar_url",
    ["https://example.test/project.png", projectId]
  );
  check(
    "wlasciciel moze ustawic avatar_url projektu",
    project.rows[0]?.avatar_url === "https://example.test/project.png",
    JSON.stringify(project.rows)
  );
});

// ------------------------------------------------------------------
section("19. cena planow w PLN (migracja 019)");

await withServiceRole(async () => {
  const { rows } = await db.query(
    "SELECT id, price_cents, price_pln_cents FROM public.plans ORDER BY sort_order"
  );
  check(
    "kazdy plan z cena stala ma tez ustawiona cene PLN",
    // enterprise (034) ma price_cents/price_pln_cents oba NULL - "contact us",
    // nie brakujaca cene PLN - patrz priceFor() w pricing-section.tsx.
    rows.every((r) => (r.price_cents === null) === (r.price_pln_cents === null)),
    JSON.stringify(rows)
  );
  check(
    "free jest darmowy w obu walutach",
    rows[0].price_cents === 0 && rows[0].price_pln_cents === 0,
    JSON.stringify(rows[0])
  );
  check(
    "pro ma dodatnia cene w PLN",
    rows[1].id === "pro" && rows[1].price_pln_cents === 3900,
    JSON.stringify(rows[1])
  );
});

// ------------------------------------------------------------------
section("20. konfigurowalne kolumny tablicy Kanban (migracja 020)");

await withUser(A, async () => {
  const inserted = await db.query(
    `INSERT INTO public.project_board_columns (project_id, status, label, sort_order, hidden)
     VALUES ($1, 'todo', 'To Do', 0, false)
     RETURNING label`,
    [projectId]
  );
  check(
    "wlasciciel moze dostosowac etykiete kolumny",
    inserted.rows[0]?.label === "To Do",
    JSON.stringify(inserted.rows)
  );

  const updated = await db.query(
    `UPDATE public.project_board_columns SET hidden = true WHERE project_id = $1 AND status = 'todo'
     RETURNING hidden`,
    [projectId]
  );
  check(
    "wlasciciel moze ukryc kolumne",
    updated.rows[0]?.hidden === true,
    JSON.stringify(updated.rows)
  );
});

await withUser(B, async () => {
  const { rows } = await db.query(
    "SELECT * FROM public.project_board_columns WHERE project_id = $1",
    [projectId]
  );
  check("B nie widzi kolumn projektu A", rows.length === 0, rows.length);
});

await expectRejected(
  "B (spoza projektu) NIE moze dodac wlasnej kolumny do projektu A",
  () =>
    withUser(B, () =>
      db.query(
        `INSERT INTO public.project_board_columns (project_id, status, label, sort_order, hidden)
         VALUES ($1, 'done', 'Shipped', 5, false)`,
        [projectId]
      )
    ),
  /permission denied|row-level security/i
);

// ------------------------------------------------------------------
section("21. sekrety github_connections / organization_ai_settings tylko przez funkcje (migracja 025)");

await withUser(A, async () => {
  await db.query(
    `INSERT INTO public.github_connections
       (project_id, connected_by, github_login, installation_id, repo_owner, repo_name, default_branch,
        access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at)
     VALUES ($1, $2, 'octocat', 1, 'octocat', 'hello-world', 'main', 'enc-access', 'enc-refresh', now() + interval '1 hour', now() + interval '6 months')`,
    [projectId, A]
  );
  await db.query(
    `INSERT INTO public.organization_ai_settings (organization_id, provider, model, api_key_encrypted, created_by)
     VALUES ($1, 'anthropic', 'claude-sonnet-5', 'enc-key', $2)`,
    [orgId, A]
  );
});

await expectRejected(
  "bezposredni SELECT access_token_encrypted odrzucony nawet dla wlasciciela",
  () => withUser(A, () => db.query("SELECT access_token_encrypted FROM public.github_connections WHERE project_id = $1", [projectId])),
  /permission denied/i
);

await expectRejected(
  "bezposredni SELECT api_key_encrypted odrzucony nawet dla wlasciciela",
  () => withUser(A, () => db.query("SELECT api_key_encrypted FROM public.organization_ai_settings WHERE organization_id = $1", [orgId])),
  /permission denied/i
);

await withUser(A, async () => {
  const { rows } = await db.query("SELECT * FROM private.get_github_connection_secrets($1)", [projectId]);
  check(
    "czlonek projektu dostaje token GitHuba przez funkcje SECURITY DEFINER",
    rows[0]?.access_token_encrypted === "enc-access",
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const { rows } = await db.query("SELECT * FROM private.get_org_ai_settings_with_key($1)", [orgId]);
  check(
    "czlonek organizacji dostaje klucz AI przez funkcje SECURITY DEFINER",
    rows[0]?.api_key_encrypted === "enc-key",
    JSON.stringify(rows)
  );
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT * FROM private.get_github_connection_secrets($1)", [projectId]);
  check("B (spoza projektu) nie dostaje nic z funkcji sekretow GitHuba", rows.length === 0, rows.length);
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT * FROM private.get_org_ai_settings_with_key($1)", [orgId]);
  check("B (spoza organizacji) nie dostaje nic z funkcji sekretow AI", rows.length === 0, rows.length);
});

await withUser(A, async () => {
  const { rows } = await db.query(
    "SELECT repo_owner, repo_name, default_branch, github_login FROM public.github_connections WHERE project_id = $1",
    [projectId]
  );
  check(
    "bezpieczne kolumny github_connections nadal czytelne wprost",
    rows[0]?.repo_owner === "octocat",
    JSON.stringify(rows)
  );
});

// ------------------------------------------------------------------
section("22. unikalnosc czlonkostwa: organization_members / project_members (migracja 026)");

await expectRejected(
  "duplikat (organization_id, user_id) w organization_members odrzucony",
  () =>
    withUser(A, () =>
      db.query("INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'member')", [
        orgId,
        A,
      ])
    ),
  /duplicate key|unique constraint/i
);

await expectRejected(
  "duplikat (project_id, user_id) w project_members odrzucony",
  () =>
    withUser(A, () =>
      db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer')", [
        projectId,
        A,
      ])
    ),
  /duplicate key|unique constraint/i
);

// ------------------------------------------------------------------
section("23. gorna granica tasks.estimated_hours / actual_hours (migracja 028)");

await expectRejected(
  "estimated_hours ponad 100000 odrzucone",
  () =>
    withUser(A, () =>
      db.query("INSERT INTO public.tasks (project_id, title, estimated_hours) VALUES ($1,'Za duzo',$2)", [
        projectId,
        100001,
      ])
    ),
  /check constraint|tasks_estimated_hours_upper_bound/i
);

await expectRejected(
  "actual_hours ponad 100000 odrzucone",
  () =>
    withUser(A, () =>
      db.query("INSERT INTO public.tasks (project_id, title, actual_hours) VALUES ($1,'Za duzo',$2)", [
        projectId,
        100001,
      ])
    ),
  /check constraint|tasks_actual_hours_upper_bound/i
);

{
  const { rows } = await withUser(A, () =>
    db.query(
      "INSERT INTO public.tasks (project_id, title, estimated_hours) VALUES ($1,'Na granicy',$2) RETURNING id",
      [projectId, 100000]
    )
  );
  check("estimated_hours = 100000 dozwolone (granica wlacznie)", rows.length === 1);
}

// ------------------------------------------------------------------
section("24. discord_integrations: RLS + sekrety tylko przez funkcje (migracja 035)");

await withUser(A, async () => {
  await db.query(
    `INSERT INTO public.discord_integrations
       (project_id, guild_id, guild_name, webhook_url_encrypted, linked_by)
     VALUES ($1, 'guild-1', 'Test Guild', 'enc-webhook', $2)`,
    [projectId, A]
  );
});

await expectRejected(
  "bezposredni SELECT webhook_url_encrypted odrzucony nawet dla wlasciciela",
  () =>
    withUser(A, () =>
      db.query("SELECT webhook_url_encrypted FROM public.discord_integrations WHERE project_id = $1", [projectId])
    ),
  /permission denied/i
);

await withUser(A, async () => {
  const { rows } = await db.query("SELECT * FROM public.get_discord_webhook_url($1)", [projectId]);
  check(
    "czlonek projektu dostaje webhook przez funkcje SECURITY DEFINER",
    rows[0]?.webhook_url_encrypted === "enc-webhook",
    JSON.stringify(rows)
  );
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT * FROM public.get_discord_webhook_url($1)", [projectId]);
  check("B (spoza projektu) nie dostaje nic z funkcji webhooka", rows.length === 0, rows.length);
});

await withUser(A, async () => {
  const { rows } = await db.query(
    "SELECT guild_id, guild_name FROM public.discord_integrations WHERE project_id = $1",
    [projectId]
  );
  check(
    "bezpieczne kolumny discord_integrations nadal czytelne wprost",
    rows[0]?.guild_id === "guild-1",
    JSON.stringify(rows)
  );
});

await withUser(B, async () => {
  // B isn't a project member, so private.project_role() is NULL for B here -
  // the UPDATE policy's USING clause matches zero rows rather than throwing
  // (RLS silently filters, it doesn't error on a non-matching UPDATE) - same
  // "no rowcount check" trap CLAUDE.md documents for this codebase's own
  // actions.ts files, verified here at the RLS layer itself.
  const result = await db.query(
    "UPDATE public.discord_integrations SET webhook_url_encrypted = 'enc-hostile' WHERE project_id = $1",
    [projectId]
  );
  check("B (spoza projektu) NIE moze nadpisac cudzego webhooka (0 wierszy)", result.rows.length === 0);
});

await withUser(A, async () => {
  const { rows } = await db.query("SELECT * FROM public.get_discord_webhook_url($1)", [projectId]);
  check(
    "webhook nietkniety po probie B",
    rows[0]?.webhook_url_encrypted === "enc-webhook",
    JSON.stringify(rows)
  );
});

// ------------------------------------------------------------------
section("25. etykieta pochodzenia akcji bota: api_keys.bot_label / task_comments.actor_label / activity_logs.actor_label (migracja 036)");

let botTestTaskId;
await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Task dla testu bot_label') RETURNING id",
    [projectId]
  );
  botTestTaskId = rows[0].id;
});

let botTestKeyId;
await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, bot_label)
     VALUES ($1, 'Discord bot (test)', 'gdn_test', 'hash-bot-label-test', '{tasks:read}', 'Discord bot')
     RETURNING id, bot_label`,
    [A]
  );
  botTestKeyId = rows[0]?.id;
  check("api_keys.bot_label zapisuje sie i odczytuje", rows[0]?.bot_label === "Discord bot", JSON.stringify(rows));
});

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.task_comments (task_id, author_id, content, actor_label)
     VALUES ($1, $2, 'Skomentowane przez bota', 'Discord bot')
     RETURNING actor_label`,
    [botTestTaskId, A]
  );
  check(
    "task_comments.actor_label zapisuje sie i odczytuje",
    rows[0]?.actor_label === "Discord bot",
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.activity_logs (project_id, user_id, action, entity_type, entity_id, actor_label)
     VALUES ($1, $2, 'task_ai_commented', 'task', $3, 'Discord bot')
     RETURNING actor_label`,
    [projectId, A, botTestTaskId]
  );
  check(
    "activity_logs.actor_label zapisuje sie i odczytuje",
    rows[0]?.actor_label === "Discord bot",
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.task_comments (task_id, author_id, content)
     VALUES ($1, $2, 'Zwykly komentarz czlowieka')
     RETURNING actor_label`,
    [botTestTaskId, A]
  );
  check(
    "actor_label domyslnie NULL - zwykle ludzkie akcje nietkniete",
    rows[0]?.actor_label === null,
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  await expectRejected(
    "wlasciciel NIE moze zmienic bot_label wlasnego klucza (tylko INSERT, np. przez OAuth link)",
    () => db.query("UPDATE public.api_keys SET bot_label = 'Hacked label' WHERE id = $1", [botTestKeyId]),
    /permission denied/i
  );
});

// ------------------------------------------------------------------
section("26. przenoszenie serwera Discord miedzy projektami: linkDiscordGuildToProject / listManageableProjectsForUser (src/lib/data/discord-integration.ts)");

// Te same instrukcje SQL co w linkDiscordGuildToProject (sciezka self-hosted);
// jesli zmienisz jedne, zmien drugie.
const CLEAR_GUILD_SQL = `UPDATE public.discord_integrations
    SET guild_id = NULL, guild_name = NULL, linked_api_key_encrypted = NULL, linked_by = NULL, updated_at = now()
  WHERE guild_id = $1 AND project_id <> $2
  RETURNING project_id`;
const LINK_GUILD_SQL = `INSERT INTO public.discord_integrations (project_id, guild_id, guild_name, linked_api_key_encrypted, linked_by, updated_at)
  VALUES ($1, $2, $3, $4, $5, now())
  ON CONFLICT (project_id) DO UPDATE SET
    guild_id = $2,
    guild_name = $3,
    linked_api_key_encrypted = $4,
    linked_by = $5,
    updated_at = now()
  RETURNING project_id`;

const C = "33333333-3333-3333-3333-333333333333";
await db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)", [
  C,
  "c@example.test",
  JSON.stringify({ full_name: "Czesiek" }),
]);

let moveP1;
let moveP2;
await withUser(A, async () => {
  moveP1 = (
    await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1,'Move P1') RETURNING id", [orgId])
  ).rows[0].id;
  moveP2 = (
    await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1,'Move P2') RETURNING id", [orgId])
  ).rows[0].id;
  // C: zwykly czlonek (bez praw zarzadzania) w P1, admin w P2.
  await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'developer')", [moveP1, C]);
  await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'admin')", [moveP2, C]);
});

// (a) A laczy serwer z P1 (z webhookiem), potem przenosi go do P2.
await withUser(A, async () => {
  await db.query(
    "INSERT INTO public.discord_integrations (project_id, webhook_url_encrypted, linked_by) VALUES ($1, 'enc-webhook-p1', $2)",
    [moveP1, A]
  );
  const link = await db.query(LINK_GUILD_SQL, [moveP1, "guild-move", "Move Guild", "enc-key-1", A]);
  check("pierwsze polaczenie serwera z P1 zwraca 1 wiersz", link.rows.length === 1, link.rows.length);
});

await withUser(A, async () => {
  const cleared = await db.query(CLEAR_GUILD_SQL, ["guild-move", moveP2]);
  check("przenosiny: wlasciciel czysci stary wiersz (1 wiersz)", cleared.rows.length === 1, cleared.rows.length);
  const link = await db.query(LINK_GUILD_SQL, [moveP2, "guild-move", "Move Guild", "enc-key-2", A]);
  check("przenosiny: upsert do P2 zwraca 1 wiersz", link.rows.length === 1, link.rows.length);
});

await withUser(A, async () => {
  const { rows } = await db.query(
    "SELECT project_id, guild_id, guild_name FROM public.discord_integrations WHERE guild_id = 'guild-move'"
  );
  check(
    "po przeniesieniu dokladnie jeden wiersz ma ten serwer, i to P2",
    rows.length === 1 && rows[0].project_id === moveP2 && rows[0].guild_name === "Move Guild",
    JSON.stringify(rows)
  );
  const old = await db.query(
    "SELECT guild_id, guild_name, linked_by FROM public.discord_integrations WHERE project_id = $1",
    [moveP1]
  );
  check(
    "stary wiersz P1 wyczyszczony z pol serwera",
    old.rows.length === 1 && old.rows[0].guild_id === null && old.rows[0].guild_name === null && old.rows[0].linked_by === null,
    JSON.stringify(old.rows)
  );
  const hook = await db.query("SELECT * FROM public.get_discord_webhook_url($1)", [moveP1]);
  check(
    "webhook starego projektu nietkniety po przeniesieniu",
    hook.rows[0]?.webhook_url_encrypted === "enc-webhook-p1",
    JSON.stringify(hook.rows)
  );
});

// Dlaczego LINK_GUILD_SQL nie uzywa EXCLUDED.<kol>: odczyt EXCLUDED to SELECT
// na kolumnie, a linked_api_key_encrypted nie ma GRANT SELECT dla authenticated.
await expectRejected(
  "upsert z EXCLUDED.linked_api_key_encrypted odrzucony (brak SELECT na kolumnie sekretu)",
  () =>
    withUser(A, () =>
      db.query(
        `INSERT INTO public.discord_integrations (project_id, linked_api_key_encrypted) VALUES ($1, 'x')
         ON CONFLICT (project_id) DO UPDATE SET linked_api_key_encrypted = EXCLUDED.linked_api_key_encrypted`,
        [moveP1]
      )
    ),
  /permission denied/i
);

// (b) serwer polaczony z P1; C (zwykly czlonek P1, admin P2) nie moze wyczyscic P1.
await withUser(A, async () => {
  await db.query(LINK_GUILD_SQL, [moveP1, "guild-locked", "Locked Guild", "enc-key-3", A]);
});

await withUser(C, async () => {
  const cleared = await db.query(CLEAR_GUILD_SQL, ["guild-locked", moveP2]);
  check("C (czlonek bez praw w P1) nie wyczysci wiersza P1 (0 wierszy)", cleared.rows.length === 0, cleared.rows.length);
});

let lockedError;
try {
  await withUser(C, async () => {
    await db.query(CLEAR_GUILD_SQL, ["guild-locked", moveP2]);
    await db.query(LINK_GUILD_SQL, [moveP2, "guild-locked", "Locked Guild", "enc-key-c", C]);
  });
} catch (error) {
  lockedError = error;
}
check(
  "po nieudanym czyszczeniu upsert w P2 wpada w UNIQUE(guild_id) (kod 23505, mapowany na blad domenowy)",
  lockedError?.code === "23505" && (!lockedError.constraint || /guild_id/.test(lockedError.constraint)),
  lockedError ? `${lockedError.code} ${lockedError.constraint ?? ""} ${lockedError.message}` : "statement was accepted"
);

await withUser(A, async () => {
  const { rows } = await db.query("SELECT project_id FROM public.discord_integrations WHERE guild_id = 'guild-locked'");
  check(
    "P1 nadal polaczony z serwerem po nieudanej probie C (transakcja wycofana)",
    rows.length === 1 && rows[0].project_id === moveP1,
    JSON.stringify(rows)
  );
});

// Admin starego projektu moze wyczyscic jego wiersz.
await withUser(A, () =>
  db.query("UPDATE public.project_members SET role = 'admin' WHERE project_id = $1 AND user_id = $2", [moveP1, C])
);
await withUser(C, async () => {
  const cleared = await db.query(CLEAR_GUILD_SQL, ["guild-locked", moveP2]);
  check("C jako admin P1 moze wyczyscic wiersz P1 (1 wiersz)", cleared.rows.length === 1, cleared.rows.length);
});

// listManageableProjectsForUser: to samo zapytanie co w module.
const LIST_MANAGEABLE_SQL = `SELECT p.id, p.name, COALESCE(o.name, '') AS organization_name,
        CASE WHEN di.guild_id IS NULL THEN NULL ELSE COALESCE(di.guild_name, di.guild_id) END AS linked_guild_name
   FROM project_members pm
   JOIN projects p ON p.id = pm.project_id
   LEFT JOIN organizations o ON o.id = p.organization_id
   LEFT JOIN discord_integrations di ON di.project_id = p.id
  WHERE pm.user_id = $1 AND pm.role IN ('owner', 'admin')
  ORDER BY o.name, p.name
  LIMIT $2`;

await withUser(A, () =>
  db.query("UPDATE public.project_members SET role = 'developer' WHERE project_id = $1 AND user_id = $2", [moveP1, C])
);
await withUser(C, async () => {
  const { rows } = await db.query(LIST_MANAGEABLE_SQL, [C, 1000]);
  check(
    "lista projektow do zarzadzania: tylko P2 (owner/admin), mimo braku czlonkostwa w organizacji (pusta nazwa org), z nazwa serwera",
    rows.length === 1 && rows[0].id === moveP2 && rows[0].linked_guild_name === "Move Guild" && rows[0].organization_name === "",
    JSON.stringify(rows)
  );
});
await withUser(A, async () => {
  const { rows } = await db.query(LIST_MANAGEABLE_SQL, [A, 1000]);
  const p1 = rows.find((r) => r.id === moveP1);
  check(
    "lista projektow do zarzadzania: wlasciciel widzi P1 jako niepolaczony (NULL)",
    p1 !== undefined && p1.linked_guild_name === null && rows.length >= 3,
    JSON.stringify(rows)
  );
});

// disconnectDiscordGuild: to samo SQL co w module (sciezka self-hosted).
const DISCONNECT_GUILD_SQL = `UPDATE public.discord_integrations
    SET guild_id = NULL, guild_name = NULL, linked_api_key_encrypted = NULL, linked_by = NULL, updated_at = now()
  WHERE project_id = $1 AND guild_id IS NOT NULL
  RETURNING project_id`;

await withUser(A, async () => {
  await db.query(LINK_GUILD_SQL, [moveP1, "guild-disc", "Disc Guild", "enc-key-d", A]);
});

await withUser(C, async () => {
  const result = await db.query(DISCONNECT_GUILD_SQL, [moveP1]);
  check("rozlaczenie: C (czlonek bez praw w P1) nie rozlaczy (0 wierszy)", result.rows.length === 0, result.rows.length);
});

await withUser(B, async () => {
  const result = await db.query(DISCONNECT_GUILD_SQL, [moveP1]);
  check("rozlaczenie: B (spoza projektu) nie rozlaczy (0 wierszy)", result.rows.length === 0, result.rows.length);
});

await withUser(A, async () => {
  const result = await db.query(DISCONNECT_GUILD_SQL, [moveP1]);
  check("rozlaczenie: wlasciciel rozlacza (1 wiersz)", result.rows.length === 1, result.rows.length);
  const { rows } = await db.query(
    "SELECT guild_id, guild_name, linked_by FROM public.discord_integrations WHERE project_id = $1",
    [moveP1]
  );
  check(
    "rozlaczenie czysci pola serwera",
    rows.length === 1 && rows[0].guild_id === null && rows[0].guild_name === null && rows[0].linked_by === null,
    JSON.stringify(rows)
  );
  const hook = await db.query("SELECT * FROM public.get_discord_webhook_url($1)", [moveP1]);
  check(
    "rozlaczenie zostawia webhook",
    hook.rows[0]?.webhook_url_encrypted === "enc-webhook-p1",
    JSON.stringify(hook.rows)
  );
  const again = await db.query(DISCONNECT_GUILD_SQL, [moveP1]);
  check("rozlaczenie juz rozlaczonego projektu = 0 wierszy (blad, nie sukces)", again.rows.length === 0, again.rows.length);
});

// Serwer da sie po rozlaczeniu podpiac gdzie indziej bez pomocy admina P1.
await withUser(C, async () => {
  await db.query(CLEAR_GUILD_SQL, ["guild-disc", moveP2]);
  const link = await db.query(LINK_GUILD_SQL, [moveP2, "guild-disc", "Disc Guild", "enc-key-e", C]);
  check("po rozlaczeniu serwer mozna polaczyc z innym projektem", link.rows.length === 1, link.rows.length);
});

// ------------------------------------------------------------------
section("27. api_keys.human_client ustawia tylko serwer + tasks_status_check przyjmuje ai_working (migracje 038, 039)");

await expectRejected(
  "zwykly uzytkownik NIE moze wstawic klucza z human_client = true",
  () =>
    withUser(A, () =>
      db.query(
        `INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, human_client)
         VALUES ($1, 'sam sobie', 'guidon_hc01', 'hash-human-client-user', '{tasks:read}', true)`,
        [A]
      )
    ),
  /permission denied/i
);

await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes)
     VALUES ($1, 'zwykly klucz', 'guidon_hc02', 'hash-human-client-default', '{tasks:read}')
     RETURNING human_client`,
    [A]
  );
  check("klucz utworzony przez uzytkownika ma human_client = false", rows[0]?.human_client === false, JSON.stringify(rows));
});

let humanKeyId;
await withServiceRole(async () => {
  const { rows } = await db.query(
    `INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, human_client)
     VALUES ($1, 'Unity Plugin', 'guidon_hc03', 'hash-human-client-server', '{tasks:read}', true)
     RETURNING id, human_client`,
    [A]
  );
  humanKeyId = rows[0]?.id;
  check("serwer (service_role) moze wystawic klucz human_client = true", rows[0]?.human_client === true, JSON.stringify(rows));
});

await expectRejected(
  "wlasciciel NIE moze zmienic human_client istniejacego klucza (UPDATE tylko revoked_at)",
  () => withUser(A, () => db.query("UPDATE public.api_keys SET human_client = true WHERE id = $1", [humanKeyId])),
  /permission denied/i
);

await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title, status) VALUES ($1, 'ai_working przechodzi', 'ai_working') RETURNING status",
    [projectId]
  );
  check("tasks_status_check przyjmuje status ai_working", rows[0]?.status === "ai_working", JSON.stringify(rows));
});

await expectRejected(
  "nieznany status odrzucony (trigger validate_task_workflow, 060)",
  () =>
    withUser(A, () =>
      db.query("INSERT INTO public.tasks (project_id, title, status) VALUES ($1, 'zly status', 'nie_ma_takiego')", [projectId])
    ),
  /check constraint|tasks_status_check|Unknown status/i
);

// ------------------------------------------------------------------
section("28. tasks.sort_order przyjmuje ulamki (migracja 040)");

await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title, sort_order) VALUES ($1, 'ulamkowy sort_order', 1062.5) RETURNING sort_order",
    [projectId]
  );
  check("sort_order = 1062.5 zapisuje sie bez bledu", Number(rows[0]?.sort_order) === 1062.5, JSON.stringify(rows));
});

await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title, sort_order) VALUES ($1, 'calkowity sort_order', 2000) RETURNING sort_order",
    [projectId]
  );
  check("calkowity sort_order nadal dziala i wraca jako liczba", rows[0]?.sort_order === 2000, JSON.stringify(rows));
});

// ------------------------------------------------------------------
section("29. task_attachments: RLS mirrors task_comments + szersze DELETE (migracja 041)");

let attachmentTaskId;
await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Task dla zalacznikow') RETURNING id",
    [projectId]
  );
  attachmentTaskId = rows[0].id;
});

await expectRejected(
  "B (spoza projektu) nie moze wstawic zalacznika",
  () =>
    withUser(B, () =>
      db.query(
        "INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by) VALUES ($1, 'x.txt', 'projects/' || ($3::uuid)::text || '/tasks/x.txt', $2)",
        [attachmentTaskId, B, projectId]
      )
    ),
  /permission denied|new row violates/i
);

let attachmentId;
await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.task_attachments (task_id, name, storage_path, size_bytes, mime_type, uploaded_by)
     VALUES ($1, 'plan.txt', 'projects/' || ($3::uuid)::text || '/tasks/t/a/1.txt', 42, 'text/plain', $2)
     RETURNING id, name`,
    [attachmentTaskId, A, projectId]
  );
  attachmentId = rows[0]?.id;
  check("wlasciciel projektu moze wstawic zalacznik", rows[0]?.name === "plan.txt", JSON.stringify(rows));
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT id FROM public.task_attachments WHERE id = $1", [attachmentId]);
  check("B (spoza projektu) nie widzi zalacznika", rows.length === 0, rows.length);
});

await withUser(A, async () => {
  const { rows } = await db.query("SELECT id, name FROM public.task_attachments WHERE task_id = $1", [
    attachmentTaskId,
  ]);
  check("czlonek projektu widzi zalacznik", rows.length === 1 && rows[0].name === "plan.txt", JSON.stringify(rows));
});

// C (zdefiniowany wczesniej w sekcji 26) jako developer w tym projekcie -
// czlonek z prawem wstawiania, ale NIE wlasciciel - zeby test usuniecia
// faktycznie sprawdzal cudzy zalacznik, a nie samo-usuniecie przez A.
await withUser(A, async () => {
  await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'developer')", [
    projectId,
    C,
  ]);
});

let othersAttachmentId;
await withUser(C, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by)
     VALUES ($1, 'cudzy.txt', 'projects/' || ($3::uuid)::text || '/tasks/t/a/2.txt', $2)
     RETURNING id`,
    [attachmentTaskId, C, projectId]
  );
  othersAttachmentId = rows[0]?.id;
});

await withUser(A, async () => {
  const result = await db.query("DELETE FROM public.task_attachments WHERE id = $1 RETURNING id", [
    othersAttachmentId,
  ]);
  check(
    "owner projektu moze usunac cudzy zalacznik (szersze niz task_comments)",
    result.rows.length === 1,
    JSON.stringify(result.rows)
  );
});

await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by) VALUES ($1, 'cascade.txt', 'projects/' || ($3::uuid)::text || '/tasks/cascade.txt', $2) RETURNING id",
    [attachmentTaskId, A, projectId]
  );
  const attId = rows[0].id;
  await db.query("DELETE FROM public.tasks WHERE id = $1", [attachmentTaskId]);
  const { rows: remaining } = await db.query("SELECT id FROM public.task_attachments WHERE id = $1", [attId]);
  check("usuniecie taska kasuje jego zalaczniki (ON DELETE CASCADE)", remaining.length === 0, remaining.length);
});

// ------------------------------------------------------------------
section("30. github_task_events: idempotencja webhooka GitHub, RLS jak task_comments (migracja 042)");

let githubTaskId;
await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Task dla GitHub') RETURNING id",
    [projectId]
  );
  githubTaskId = rows[0].id;
});

await withUser(A, async () => {
  const first = await db.query(
    "INSERT INTO public.github_task_events (task_id, event_key) VALUES ($1, 'commit:abc') ON CONFLICT DO NOTHING RETURNING event_key",
    [githubTaskId]
  );
  const again = await db.query(
    "INSERT INTO public.github_task_events (task_id, event_key) VALUES ($1, 'commit:abc') ON CONFLICT DO NOTHING RETURNING event_key",
    [githubTaskId]
  );
  check(
    "pierwsze zdarzenie zwraca wiersz, powtorka nie (ON CONFLICT DO NOTHING RETURNING)",
    first.rows.length === 1 && again.rows.length === 0,
    `${first.rows.length}/${again.rows.length}`
  );
});

await expectRejected(
  "B (spoza projektu) nie moze zapisac zdarzenia",
  () =>
    withUser(B, () =>
      db.query("INSERT INTO public.github_task_events (task_id, event_key) VALUES ($1, 'pr:1:open')", [githubTaskId])
    ),
  /permission denied|new row violates/i
);

await withUser(B, async () => {
  const { rows } = await db.query("SELECT event_key FROM public.github_task_events WHERE task_id = $1", [githubTaskId]);
  check("B (spoza projektu) nie widzi zdarzen", rows.length === 0, rows.length);
});

await withUser(C, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.github_task_events (task_id, event_key) VALUES ($1, 'pr:2:open') RETURNING event_key",
    [githubTaskId]
  );
  check("developer projektu moze zapisac zdarzenie", rows.length === 1, JSON.stringify(rows));
});

await withUser(A, async () => {
  await db.query("DELETE FROM public.tasks WHERE id = $1", [githubTaskId]);
  const { rows } = await db.query("SELECT 1 FROM public.github_task_events WHERE task_id = $1", [githubTaskId]);
  check("usuniecie taska kasuje jego zdarzenia (ON DELETE CASCADE)", rows.length === 0, rows.length);
});

section("31. stripe_webhook_events: idempotencja webhooka Stripe, brak dostepu dla authenticated (migracja 043)");

await withServiceRole(async () => {
  const first = await db.query(
    "INSERT INTO public.stripe_webhook_events (event_id, event_type) VALUES ('evt_test_1', 'customer.subscription.updated') ON CONFLICT DO NOTHING RETURNING event_id",
    []
  );
  const again = await db.query(
    "INSERT INTO public.stripe_webhook_events (event_id, event_type) VALUES ('evt_test_1', 'customer.subscription.updated') ON CONFLICT DO NOTHING RETURNING event_id",
    []
  );
  check(
    "pierwsze zdarzenie zwraca wiersz, powtorka nie (ON CONFLICT DO NOTHING RETURNING)",
    first.rows.length === 1 && again.rows.length === 0,
    `${first.rows.length}/${again.rows.length}`
  );
});

await expectRejected(
  "A (zwykly authenticated) nie moze wstawic zdarzenia - brak polityki",
  () =>
    withUser(A, () =>
      db.query("INSERT INTO public.stripe_webhook_events (event_id, event_type) VALUES ('evt_test_2', 'x')")
    ),
  /permission denied|new row violates/i
);

await expectRejected(
  "A (zwykly authenticated) nie moze odczytac zdarzen - brak GRANT SELECT",
  () => withUser(A, () => db.query("SELECT event_id FROM public.stripe_webhook_events")),
  /permission denied/i
);

// ------------------------------------------------------------------
section("32. feedback: kazdy widzi/wstawia tylko swoj wiersz, admin czyta wszystko przez service_role (migracja 044)");

let feedbackId;
await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.feedback (user_id, message, page_url) VALUES ($1, 'Swietna appka!', '/dashboard') RETURNING id",
    [A]
  );
  feedbackId = rows[0]?.id;
  check("A moze wstawic wlasny feedback", rows.length === 1, JSON.stringify(rows));
});

await expectRejected(
  "A nie moze wstawic feedbacku jako ktos inny",
  () =>
    withUser(A, () =>
      db.query("INSERT INTO public.feedback (user_id, message) VALUES ($1, 'podszywam sie')", [B])
    ),
  /permission denied|new row violates/i
);

await withUser(A, async () => {
  const { rows } = await db.query("SELECT id FROM public.feedback WHERE id = $1", [feedbackId]);
  check("A widzi wlasny feedback", rows.length === 1, rows.length);
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT id FROM public.feedback WHERE id = $1", [feedbackId]);
  check("B nie widzi cudzego feedbacku", rows.length === 0, rows.length);
});

await withServiceRole(async () => {
  const { rows } = await db.query("SELECT id FROM public.feedback WHERE id = $1", [feedbackId]);
  check("panel admina (service_role) widzi kazdy feedback", rows.length === 1, rows.length);
});

section("32b. feedback rating: nullable legacy rows, bounded scores and unchanged RLS (084)");
await withUser(A, async () => {
  check("old writer still produces an unrated row",(await db.query("SELECT rating FROM public.feedback WHERE id=$1",[feedbackId])).rows[0]?.rating===null);
  for(const rating of [1,5]){
    const saved=await db.query("INSERT INTO public.feedback(user_id,message,rating) VALUES($1,'Rated feedback',$2) RETURNING rating",[A,rating]);
    check(`rating ${rating} round-trips`,saved.rows[0]?.rating===rating);
  }
  for(const rating of [0,6,1.5])check(`invalid rating ${rating} rejected`,await throwsInSavepoint("INSERT INTO public.feedback(user_id,message,rating) VALUES($1,'Invalid rating',$2)",[A,rating]));
  check("rating does not allow author impersonation",await throwsInSavepoint("INSERT INTO public.feedback(user_id,message,rating) VALUES($1,'Impersonated',5)",[B]));
  check("rating cannot be used to edit feedback",await throwsInSavepoint("UPDATE public.feedback SET rating=5 WHERE id=$1",[feedbackId]));
});
await withUser(B,async()=>{check("rated feedback stays private to its author",(await db.query("SELECT id FROM public.feedback WHERE user_id=$1",[A])).rows.length===0);});

// ------------------------------------------------------------------
section("33. notifications: brak insert dla authenticated, kazdy widzi/oznacza/usuwa tylko swoje (migracja 045)");

let notificationId;
await withServiceRole(async () => {
  const { rows } = await db.query(
    `INSERT INTO public.notifications (user_id, project_id, type, title, link)
     VALUES ($1, $2, 'task_assigned', 'Przypisano Ci zadanie', $3)
     RETURNING id`,
    [A, projectId, `/projects/${projectId}/work?openTask=x`]
  );
  notificationId = rows[0]?.id;
  check("service_role moze wstawic powiadomienie dla dowolnego uzytkownika", rows.length === 1, JSON.stringify(rows));
});

await expectRejected(
  "A (zwykly authenticated) nie moze wstawic powiadomienia - brak polityki insert",
  () =>
    withUser(A, () =>
      db.query(
        "INSERT INTO public.notifications (user_id, type, title, link) VALUES ($1, 'task_assigned', 'x', '/x')",
        [A]
      )
    ),
  /permission denied/i
);

await withUser(A, async () => {
  const { rows } = await db.query("SELECT id, read_at FROM public.notifications WHERE id = $1", [notificationId]);
  check("A widzi wlasne powiadomienie", rows.length === 1, rows.length);
  check("nowe powiadomienie jest nieprzeczytane", rows[0]?.read_at === null, rows[0]?.read_at);
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT id FROM public.notifications WHERE id = $1", [notificationId]);
  check("B nie widzi cudzego powiadomienia", rows.length === 0, rows.length);
});

await withUser(B, async () => {
  const result = await db.query("UPDATE public.notifications SET read_at = now() WHERE id = $1", [notificationId]);
  check("B nie moze oznaczyc cudzego powiadomienia jako przeczytane", result.rowCount === 0, result.rowCount);
});

await withUser(A, async () => {
  const result = await db.query("UPDATE public.notifications SET read_at = now() WHERE id = $1", [notificationId]);
  check("A moze oznaczyc wlasne powiadomienie jako przeczytane", result.rowCount === 1, result.rowCount);
});

await withUser(B, async () => {
  const result = await db.query("DELETE FROM public.notifications WHERE id = $1", [notificationId]);
  check("B nie moze usunac cudzego powiadomienia", result.rowCount === 0, result.rowCount);
});

await withUser(A, async () => {
  const result = await db.query("DELETE FROM public.notifications WHERE id = $1", [notificationId]);
  check("A moze usunac wlasne powiadomienie", result.rowCount === 1, result.rowCount);
});

// ------------------------------------------------------------------
section("34. projects.ai_enabled: domyslnie wlaczone, owner moze przelaczyc (migracja 046)");

await withUser(A, async () => {
  const { rows } = await db.query("SELECT ai_enabled FROM public.projects WHERE id = $1", [projectId]);
  check("istniejacy projekt ma ai_enabled = true (DEFAULT)", rows[0]?.ai_enabled === true, rows[0]?.ai_enabled);
});

await withUser(A, async () => {
  // Would throw "permission denied for table projects" if 046 forgot to
  // append ai_enabled to the column-scoped GRANT UPDATE.
  const result = await db.query("UPDATE public.projects SET ai_enabled = false WHERE id = $1", [projectId]);
  check("owner moze wylaczyc AI (kolumna w GRANT UPDATE)", result.rowCount === 1, result.rowCount);
});

await withUser(B, async () => {
  const result = await db.query("UPDATE public.projects SET ai_enabled = true WHERE id = $1", [projectId]);
  check("B (spoza projektu) nie moze przelaczyc AI", result.rowCount === 0, result.rowCount);
});

await withUser(A, async () => {
  const result = await db.query("UPDATE public.projects SET ai_enabled = true WHERE id = $1 RETURNING ai_enabled", [projectId]);
  check("owner moze ponownie wlaczyc AI", result.rows[0]?.ai_enabled === true, JSON.stringify(result.rows));
});


section("35. find_user_id_by_email: owner/admin organizacji znajduje osobe spoza niej (migracja 047)");

const D = "44444444-4444-4444-4444-444444444444";
await db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)", [
  D,
  "d@example.test",
  JSON.stringify({ full_name: "Dorota" }),
]);

await withUser(A, async () => {
  // The original bug: profiles RLS (003) hides anyone the caller doesn't
  // already share a workspace with - i.e. exactly the person being added.
  const plain = await db.query("SELECT id FROM public.profiles WHERE email = 'd@example.test'");
  check("zwykly SELECT na profiles nie widzi osoby spoza workspace'u (RLS 003)", plain.rows.length === 0, plain.rows.length);

  const found = await db.query("SELECT public.find_user_id_by_email($1, $2) AS id", [orgId, "  D@Example.test "]);
  check("owner organizacji znajduje id po e-mailu (wielkosc liter/spacje bez znaczenia)", found.rows[0]?.id === D, found.rows[0]?.id);

  const missing = await db.query("SELECT public.find_user_id_by_email($1, $2) AS id", [orgId, "nobody@example.test"]);
  check("nieistniejacy e-mail -> NULL", missing.rows[0]?.id === null, missing.rows[0]?.id);

  const added = await db.query(
    "INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'member') RETURNING user_id",
    [orgId, D]
  );
  check("owner dodaje znaleziona osobe do organizacji", added.rows[0]?.user_id === D, JSON.stringify(added.rows));
});

await withUser(D, async () => {
  // D is now a plain member of orgId - not owner/admin, so no lookups.
  const r = await db.query("SELECT public.find_user_id_by_email($1, $2) AS id", [orgId, "c@example.test"]);
  check("zwykly member nie moze wyszukiwac po e-mailu", r.rows[0]?.id === null, r.rows[0]?.id);
});

await withUser(C, async () => {
  const r = await db.query("SELECT public.find_user_id_by_email($1, $2) AS id", [orgId, "d@example.test"]);
  check("osoba spoza organizacji nie moze wyszukiwac po e-mailu", r.rows[0]?.id === null, r.rows[0]?.id);
});

{
  let threw = false;
  try {
    await withAnon(() => db.query("SELECT public.find_user_id_by_email($1, $2)", [orgId, "d@example.test"]));
  } catch {
    threw = true;
  }
  check("anon nie ma EXECUTE", threw);
}


section("36. project_references: moodboard - RLS jak task_attachments + UPDATE tylko caption/tags/source_url (migracja 048)");

let refA;
let refD;
await withUser(A, async () => {
  // D is an org member since section 35; make them a developer on the project.
  await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'developer')", [projectId, D]);
  const r = await db.query(
    `INSERT INTO public.project_references (project_id, name, storage_path, mime_type, uploaded_by, tags)
     VALUES ($1, 'castle.png', 'projects/' || ($1::uuid)::text || '/references/a.png', 'image/png', $2, '{env,castle}') RETURNING id, tags`,
    [projectId, A]
  );
  refA = r.rows[0]?.id;
  check("owner dodaje referencje", Boolean(refA) && r.rows[0].tags.length === 2, JSON.stringify(r.rows));

  let threw = false;
  try {
    await db.query("SAVEPOINT s");
    await db.query(
      "INSERT INTO public.project_references (project_id, name, storage_path, mime_type, uploaded_by) VALUES ($1, 'doc.pdf', 'projects/' || ($1::uuid)::text || '/references/doc.pdf', 'application/pdf', $2)",
      [projectId, A]
    );
  } catch {
    threw = true;
  }
  await db.query("ROLLBACK TO SAVEPOINT s");
  check("tylko obrazy (CHECK mime_type image/%)", threw);
});

await withUser(D, async () => {
  const r = await db.query(
    "INSERT INTO public.project_references (project_id, name, storage_path, mime_type, uploaded_by) VALUES ($1, 'mood.jpg', 'projects/' || ($1::uuid)::text || '/references/mood.jpg', 'image/jpeg', $2) RETURNING id",
    [projectId, D]
  );
  refD = r.rows[0]?.id;
  check("developer dodaje wlasna referencje", Boolean(refD));

  const seen = await db.query("SELECT id FROM public.project_references WHERE project_id = $1", [projectId]);
  check("developer widzi wszystkie referencje projektu", seen.rows.length === 2, seen.rows.length);

  const own = await db.query("UPDATE public.project_references SET caption = 'Mood' WHERE id = $1 AND project_id = $2", [refD, projectId]);
  check("autor zmienia podpis swojej referencji", own.rowCount === 1, own.rowCount);

  const other = await db.query("UPDATE public.project_references SET caption = 'x' WHERE id = $1 AND project_id = $2", [refA, projectId]);
  check("developer nie zmienia cudzej referencji", other.rowCount === 0, other.rowCount);

  let threw = false;
  try {
    await db.query("SAVEPOINT s");
    await db.query("UPDATE public.project_references SET storage_path = 'someone-else.png' WHERE id = $1", [refD]);
  } catch (error) {
    threw = /permission denied/.test(error.message);
  }
  await db.query("ROLLBACK TO SAVEPOINT s");
  check("UPDATE storage_path/project_id zablokowany (GRANT kolumnowy)", threw);

  const del = await db.query("DELETE FROM public.project_references WHERE id = $1 AND project_id = $2", [refA, projectId]);
  check("developer nie usuwa cudzej referencji", del.rowCount === 0, del.rowCount);
});

await withUser(B, async () => {
  const seen = await db.query("SELECT id FROM public.project_references WHERE project_id = $1", [projectId]);
  check("osoba spoza projektu nie widzi referencji", seen.rows.length === 0, seen.rows.length);

  let threw = false;
  try {
    await db.query("SAVEPOINT s");
    await db.query(
      "INSERT INTO public.project_references (project_id, name, storage_path, mime_type, uploaded_by) VALUES ($1, 'x.png', 'projects/' || ($1::uuid)::text || '/references/x.png', 'image/png', $2)",
      [projectId, B]
    );
  } catch {
    threw = true;
  }
  await db.query("ROLLBACK TO SAVEPOINT s");
  check("osoba spoza projektu nie dodaje referencji", threw);
});

await withUser(A, async () => {
  const del = await db.query("DELETE FROM public.project_references WHERE id = $1 AND project_id = $2", [refD, projectId]);
  check("owner usuwa cudza referencje", del.rowCount === 1, del.rowCount);
});

{
  let threw = false;
  try {
    await withAnon(() => db.query("SELECT 1 FROM public.project_references LIMIT 1"));
  } catch {
    threw = true;
  }
  check("anon nie ma dostepu", threw);
}


section("37. data-client: SQL z kompilatora (src/lib/data-client/sql.ts) dziala na prawdziwym schemacie pod RLS");

const spec = (over) => ({ table: "project_references", op: "select", columns: ["*"], filters: [], order: [], limit: null, values: null, ...over });
const run = (q) => db.query(q.text, q.values);

let dcRef;
await withUser(A, async () => {
  const ins = await run(compile(spec({
    op: "insert",
    columns: ["id", "tags", "caption"],
    values: [{ project_id: projectId, name: "dc.png", storage_path: `projects/${projectId}/references/dc.png`, mime_type: "image/png", uploaded_by: A }],
  })));
  dcRef = ins.rows[0]?.id;
  check("insert ... RETURNING; brak klucza -> DEFAULT (tags = '{}')", Boolean(dcRef) && Array.isArray(ins.rows[0].tags) && ins.rows[0].tags.length === 0, JSON.stringify(ins.rows));

  const multi = await run(compile(spec({
    op: "insert",
    columns: ["id"],
    values: [
      { project_id: projectId, name: "m1.png", storage_path: `projects/${projectId}/references/m1.png`, mime_type: "image/png", uploaded_by: A, caption: "one" },
      { project_id: projectId, name: "m2.png", storage_path: `projects/${projectId}/references/m2.png`, mime_type: "image/png", uploaded_by: A },
    ],
  })));
  check("insert kilku wierszy z roznymi kluczami", multi.rows.length === 2, multi.rows.length);

  const sel = await run(compile(spec({
    columns: parseColumns("id, name, caption"),
    filters: [
      { column: "project_id", op: "eq", value: projectId },
      { column: "name", op: "in", value: ["m1.png", "m2.png", "dc.png"] },
      { column: "caption", op: "is", value: null },
    ],
    order: [{ column: "name", ascending: false }],
    limit: 5,
  })));
  check("select z eq/in/is null/order/limit", sel.rows.map((r) => r.name).join(",") === "m2.png,dc.png", sel.rows.map((r) => r.name).join(","));

  const none = await run(compile(spec({ filters: [{ column: "id", op: "in", value: [] }] })));
  check("puste .in() nic nie zwraca", none.rows.length === 0, none.rows.length);

  const upd = await run(compile(spec({
    op: "update",
    columns: ["caption", "tags"],
    values: [{ caption: "Updated", tags: ["a", "b"] }],
    filters: [{ column: "id", op: "eq", value: dcRef }, { column: "project_id", op: "eq", value: projectId }],
  })));
  check("update ... RETURNING (tablica text[] jako parametr)", upd.rows[0]?.caption === "Updated" && upd.rows[0]?.tags.join() === "a,b", JSON.stringify(upd.rows));
});

await withUser(D, async () => {
  // D is a developer (section 36): may read, may not edit someone else's reference.
  const upd = await run(compile(spec({
    op: "update",
    columns: ["id"],
    values: [{ caption: "hijack" }],
    filters: [{ column: "id", op: "eq", value: dcRef }, { column: "project_id", op: "eq", value: projectId }],
  })));
  check("RLS dalej obowiazuje: cudzy UPDATE -> 0 wierszy", upd.rows.length === 0, upd.rows.length);

  let denied = false;
  try {
    await db.query("SAVEPOINT s");
    await run(compile(spec({ op: "update", columns: null, values: [{ storage_path: "x" }], filters: [{ column: "id", op: "eq", value: dcRef }] })));
  } catch (error) {
    denied = /permission denied/.test(error.message);
  }
  await db.query("ROLLBACK TO SAVEPOINT s");
  check("GRANT kolumnowy dalej obowiazuje (storage_path)", denied);
});

await withUser(A, async () => {
  const del = await run(compile(spec({
    op: "delete",
    columns: ["storage_path"],
    filters: [{ column: "project_id", op: "eq", value: projectId }, { column: "name", op: "like", value: "m%.png" }],
  })));
  check("delete ... RETURNING storage_path z LIKE", del.rows.length === 2, del.rows.length);

  // technology/actions.ts duplicate check: ILIKE with LIKE wildcards escaped
  // must match case-insensitively but literally ("C_" must not match "CS").
  await db.query("INSERT INTO public.technologies (project_id, name) VALUES ($1, 'CS'), ($1, 'C_')", [projectId]);
  const esc = (name) => name.replace(/[\\%_]/g, "\\$&");
  const like = async (name) =>
    (await run(compile({ table: "technologies", op: "select", columns: ["name"], filters: [
      { column: "project_id", op: "eq", value: projectId },
      { column: "name", op: "ilike", value: esc(name) },
    ], order: [], limit: null, values: null }))).rows.map((r) => r.name).join(",");
  check("ilike z escapowaniem: 'c_' -> tylko 'C_'", (await like("c_")) === "C_", await like("c_"));
  check("ilike z escapowaniem: 'cs' -> tylko 'CS'", (await like("cs")) === "CS", await like("cs"));
  await db.query("DELETE FROM public.technologies WHERE project_id = $1 AND name IN ('CS', 'C_')", [projectId]);
  await run(compile(spec({ op: "delete", columns: null, filters: [{ column: "id", op: "eq", value: dcRef }] })));
});

{
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check("zly identyfikator tabeli odrzucony", throws(() => compile(spec({ table: 'tasks"; drop table tasks; --' }))));
  check("zly identyfikator kolumny odrzucony", throws(() => compile(spec({ filters: [{ column: "id = id OR 1", op: "eq", value: 1 }] }))));
  check("embed PostgREST odrzucony", throws(() => parseColumns("id, profiles(full_name)")));
  check("UPDATE bez filtrow odrzucony", throws(() => compile(spec({ op: "update", values: [{ caption: "x" }] }))));
  check("DELETE bez filtrow odrzucony", throws(() => compile(spec({ op: "delete", columns: null }))));
  const q = compile(spec({ filters: [{ column: "name", op: "eq", value: "x'; drop table tasks; --" }] }));
  check("wartosci zawsze jako parametry", !q.text.includes("drop") && q.values[0].includes("drop"), q.text);
}

// data-client rpc(): named arguments, array params typed by the function's
// own signature, and RLS still applying inside a non-SECURITY DEFINER function.
{
  const ids = await withUser(A, async () => {
    const rows = [];
    for (const [title, order] of [["rpc-a", 1], ["rpc-b", 2], ["rpc-c", 3]]) {
      const r = await db.query(
        "INSERT INTO public.tasks (project_id, title, status, priority, tags, created_by, sort_order) VALUES ($1, $2, 'todo', 'medium', '{}', $3, $4) RETURNING id",
        [projectId, title, A, order]
      );
      rows.push(r.rows[0].id);
    }
    return rows;
  });
  const renumber = (orders) =>
    compileRpc("renumber_task_sort_orders", { p_ids: ids, p_sort_orders: orders, p_project_id: projectId }, "value");
  const orders = async () =>
    (await db.query("SELECT sort_order FROM public.tasks WHERE id = ANY($1) ORDER BY title", [ids])).rows.map((r) => r.sort_order).join(",");

  await withUser(B, () => run(renumber([7, 8, 9])));
  check("rpc pod RLS: obcy uzytkownik nic nie przenumeruje", (await orders()) === "1,2,3", await orders());

  const voidResult = await withUser(A, () => run(renumber([30, 20, 10])));
  check("rpc (void): nazwane argumenty + tablice uuid[]/int[]", (await orders()) === "30,20,10", await orders());
  check("rpc (void): value = null", voidResult.rows[0]?.value === null, JSON.stringify(voidResult.rows));

  const found = await withUser(A, () =>
    run(compileRpc("find_user_id_by_email", { p_organization_id: orgId, p_email: "d@example.test" }, "value"))
  );
  check("rpc (skalar): find_user_id_by_email zwraca uuid", found.rows[0]?.value === D, JSON.stringify(found.rows));

  const discordRows = await withUser(A, () => run(compileRpc("get_discord_webhook_url", { p_project_id: projectId }, "rows")));
  check("rpcRows: funkcja TABLE wykonuje sie pod RLS (tablica wierszy)", Array.isArray(discordRows.rows), JSON.stringify(discordRows.rows));
  const notNull = await withUser(A, () =>
    run(compile({ table: "tasks", op: "select", columns: ["title"], filters: [{ column: "id", op: "in", value: ids }, { column: "parent_task_id", op: "isNot", value: null }], order: [], limit: null, values: null }))
  );
  check("isNot(null) -> IS NOT NULL", notNull.rows.length === 0, JSON.stringify(notNull.rows));
  const rowsSql = compileRpc("get_discord_webhook_url", { p_project_id: projectId }, "rows").text;
  check("rpcRows: SELECT * FROM public.fn(...)", rowsSql === 'SELECT * FROM public."get_discord_webhook_url"("p_project_id" => $1)', rowsSql);

  let rejected = false;
  try {
    compileRpc("x(); drop table tasks; --", {}, "value");
  } catch {
    rejected = true;
  }
  check("rpc: zla nazwa funkcji odrzucona", rejected);

  const counted = await withUser(A, () =>
    run(compileCount({ table: "tasks", op: "select", columns: ["*"], filters: [{ column: "id", op: "in", value: ids }, { column: "sort_order", op: "gte", value: 20 }], order: [], limit: null, values: null }))
  );
  check("count() z filtrami", counted.rows[0]?.count === 2, JSON.stringify(counted.rows));
  const hidden = await withUser(B, () =>
    run(compileCount({ table: "tasks", op: "select", columns: ["*"], filters: [{ column: "id", op: "in", value: ids }], order: [], limit: null, values: null }))
  );
  check("count() pod RLS: obcy widzi 0", hidden.rows[0]?.count === 0, JSON.stringify(hidden.rows));

  // saveDiscordWebhookUrl: update-then-insert works for an owner; the upsert
  // it replaced can't, because EXCLUDED.webhook_url_encrypted needs a SELECT
  // grant authenticated doesn't have (035).
  await expectRejected(
    "stary upsert webhooka Discorda -> permission denied (powod zmiany)",
    () => withUser(A, () => db.query(
      `INSERT INTO public.discord_integrations (project_id, webhook_url_encrypted, linked_by) VALUES ($1, 'enc', $2)
       ON CONFLICT (project_id) DO UPDATE SET webhook_url_encrypted = EXCLUDED.webhook_url_encrypted`, [projectId, A])),
    /permission denied/
  );
  await withUser(A, async () => {
    const upd = await run(compile({ table: "discord_integrations", op: "update", columns: ["project_id"], filters: [{ column: "project_id", op: "eq", value: projectId }], order: [], limit: null, values: [{ webhook_url_encrypted: "enc1" }] }));
    const ins = upd.rows.length > 0 ? upd : await run(compile({ table: "discord_integrations", op: "insert", columns: ["project_id"], filters: [], order: [], limit: null, values: [{ project_id: projectId, webhook_url_encrypted: "enc1", linked_by: A }] }));
    check("zapis webhooka Discorda: insert przez ownera dziala", ins.rows.length === 1, JSON.stringify(ins.rows));
    const again = await run(compile({ table: "discord_integrations", op: "update", columns: ["project_id"], filters: [{ column: "project_id", op: "eq", value: projectId }], order: [], limit: null, values: [{ webhook_url_encrypted: "enc2" }] }));
    check("zapis webhooka Discorda: ponowny zapis to update", again.rows.length === 1, JSON.stringify(again.rows));
  });
  const stored = await db.query("SELECT webhook_url_encrypted FROM public.discord_integrations WHERE project_id = $1", [projectId]);
  check("zapis webhooka Discorda: wartosc zapisana", stored.rows[0]?.webhook_url_encrypted === "enc2", JSON.stringify(stored.rows));
  await db.query("DELETE FROM public.discord_integrations WHERE project_id = $1", [projectId]);

  // Same EXCLUDED problem for the other two encrypted-secret tables - the
  // app now saves them with the data client's upsertRow (update, then insert).
  const ownerOrg = (await db.query("SELECT organization_id FROM public.projects WHERE id = $1", [projectId])).rows[0].organization_id;
  await expectRejected(
    "stary upsert ustawien AI organizacji -> permission denied",
    () => withUser(A, () => db.query(
      `INSERT INTO public.organization_ai_settings (organization_id, provider, model, api_key_encrypted, created_by) VALUES ($1, 'anthropic', 'm', 'enc', $2)
       ON CONFLICT (organization_id) DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted`, [ownerOrg, A])),
    /permission denied/
  );
  await withUser(A, async () => {
    const upd = await run(compile({ table: "organization_ai_settings", op: "update", columns: ["organization_id"], filters: [{ column: "organization_id", op: "eq", value: ownerOrg }], order: [], limit: null, values: [{ api_key_encrypted: "k1" }] }));
    const ins = upd.rows.length > 0 ? upd : await run(compile({ table: "organization_ai_settings", op: "insert", columns: ["organization_id"], filters: [], order: [], limit: null, values: [{ organization_id: ownerOrg, provider: "anthropic", model: "m", api_key_encrypted: "k1", created_by: A }] }));
    check("zapis ustawien AI: insert przez ownera organizacji dziala", ins.rows.length === 1, JSON.stringify(ins.rows));
    const again = await run(compile({ table: "organization_ai_settings", op: "update", columns: ["organization_id"], filters: [{ column: "organization_id", op: "eq", value: ownerOrg }], order: [], limit: null, values: [{ api_key_encrypted: "k2", model: "m2" }] }));
    check("zapis ustawien AI: ponowny zapis to update", again.rows.length === 1, JSON.stringify(again.rows));
    const viaRpc = await run(compileRpc("get_org_ai_settings_with_key", { p_organization_id: ownerOrg }, "rows"));
    check("get_org_ai_settings_with_key (rpcRows) zwraca zapisany klucz", viaRpc.rows[0]?.api_key_encrypted === "k2" && viaRpc.rows[0]?.model === "m2", JSON.stringify(viaRpc.rows));
  });
  await db.query("DELETE FROM public.organization_ai_settings WHERE organization_id = $1", [ownerOrg]);

  await expectRejected(
    "stary upsert polaczenia GitHub -> permission denied",
    () => withUser(A, () => db.query(
      `INSERT INTO public.github_connections (project_id, connected_by, github_login, installation_id, repo_owner, repo_name, default_branch, access_token_encrypted, refresh_token_encrypted)
       VALUES ($1, $2, 'l', 1, 'o', 'r', 'main', 'a', 'r')
       ON CONFLICT (project_id) DO UPDATE SET access_token_encrypted = EXCLUDED.access_token_encrypted`, [projectId, A])),
    /permission denied/
  );
  await withUser(A, async () => {
    const first = await run(compile({ table: "github_connections", op: "update", columns: ["project_id"], filters: [{ column: "project_id", op: "eq", value: projectId }], order: [], limit: null, values: [{ access_token_encrypted: "a1" }] }));
    const ins = first.rows.length > 0 ? first : await run(compile({ table: "github_connections", op: "insert", columns: ["project_id"], filters: [], order: [], limit: null, values: [{ project_id: projectId, connected_by: A, github_login: "l", installation_id: 1, repo_owner: "o", repo_name: "r", default_branch: "main", access_token_encrypted: "a1", refresh_token_encrypted: "r1", access_token_expires_at: "2030-01-01T00:00:00Z", refresh_token_expires_at: "2030-06-01T00:00:00Z" }] }));
    check("zapis polaczenia GitHub: update/insert przez ownera projektu dziala", ins.rows.length === 1, JSON.stringify(ins.rows));
    const upd = await run(compile({ table: "github_connections", op: "update", columns: ["project_id"], filters: [{ column: "project_id", op: "eq", value: projectId }], order: [], limit: null, values: [{ access_token_encrypted: "a2", repo_name: "r2" }] }));
    check("zapis polaczenia GitHub: ponowny zapis to update", upd.rows.length === 1, JSON.stringify(upd.rows));
    const secrets = await run(compileRpc("get_github_connection_secrets", { p_project_id: projectId }, "rows"));
    check("get_github_connection_secrets (rpcRows, publiczny wrapper 030) zwraca token", secrets.rows[0]?.access_token_encrypted === "a2", JSON.stringify(secrets.rows));
  });
  await db.query("DELETE FROM public.github_connections WHERE project_id = $1", [projectId]);

  await db.query("DELETE FROM public.tasks WHERE id = ANY($1)", [ids]);
}

section("38. plans.member_limit_per_project: limit czlonkow projektu w planach (migracja 049)");

await withUser(A, async () => {
  const { rows } = await db.query("SELECT id, member_limit_per_project AS n FROM public.plans ORDER BY sort_order");
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.n]));
  check("free = 5, pro = 15, team = 50", byId.free === 5 && byId.pro === 15 && byId.team === 50, JSON.stringify(byId));
  check("business/enterprise bez limitu (NULL)", byId.business === null && byId.enterprise === null, JSON.stringify(byId));

  let threw = false;
  try {
    await db.query("SAVEPOINT s");
    await db.query("UPDATE public.plans SET member_limit_per_project = 1000 WHERE id = 'free'");
  } catch {
    threw = true;
  }
  await db.query("ROLLBACK TO SAVEPOINT s");
  check("authenticated nie moze zmienic limitu planu", threw);
});

{
  let threw = false;
  try {
    await db.query("UPDATE public.plans SET member_limit_per_project = 0 WHERE id = 'free'");
  } catch {
    threw = true;
  }
  check("CHECK odrzuca limit 0", threw);
}

section("39. organization_webhooks: tylko owner/admin organizacji, sekret niewidoczny dla authenticated (migracja 050)");

async function throwsInSavepoint(sql, params) {
  try {
    await db.query("SAVEPOINT s");
    await db.query(sql, params);
    await db.query("RELEASE SAVEPOINT s");
    return false;
  } catch {
    await db.query("ROLLBACK TO SAVEPOINT s");
    return true;
  }
}

const insertWebhookSql = `INSERT INTO public.organization_webhooks (organization_id, url, events, secret_encrypted, created_by)
  VALUES ($1, 'https://example.com/hook', $2::text[], 'enc', $3) RETURNING id`;

let webhookId;
await withUser(A, async () => {
  const inserted = await db.query(insertWebhookSql, [orgId, ["task.created"], A]);
  webhookId = inserted.rows[0]?.id;
  check("owner organizacji dodaje webhook", Boolean(webhookId), JSON.stringify(inserted.rows));

  const listed = await db.query("SELECT id, url, events FROM public.organization_webhooks WHERE organization_id = $1", [orgId]);
  check("owner widzi webhook", listed.rows.length === 1, listed.rows.length);

  check(
    "owner NIE czyta secret_encrypted (GRANT kolumnowy)",
    await throwsInSavepoint("SELECT secret_encrypted FROM public.organization_webhooks WHERE id = $1", [webhookId])
  );

  const updated = await db.query("UPDATE public.organization_webhooks SET enabled = false WHERE id = $1 RETURNING enabled", [webhookId]);
  check("owner wylacza webhook", updated.rows[0]?.enabled === false, JSON.stringify(updated.rows));

  check(
    "owner nie zapisuje last_* (tylko service_role)",
    await throwsInSavepoint("UPDATE public.organization_webhooks SET last_status = 200 WHERE id = $1", [webhookId])
  );
  check("CHECK odrzuca nieznane zdarzenie", await throwsInSavepoint(insertWebhookSql, [orgId, ["task.exploded"], A]));
  check("CHECK odrzuca pusta liste zdarzen", await throwsInSavepoint(insertWebhookSql, [orgId, [], A]));
  check("created_by musi byc wywolujacym", await throwsInSavepoint(insertWebhookSql, [orgId, ["task.created"], B]));
});

await withUser(D, async () => {
  const listed = await db.query("SELECT id FROM public.organization_webhooks WHERE organization_id = $1", [orgId]);
  check("zwykly member organizacji nie widzi webhookow", listed.rows.length === 0, listed.rows.length);
  check("zwykly member nie dodaje webhooka", await throwsInSavepoint(insertWebhookSql, [orgId, ["task.created"], D]));
  const del = await db.query("DELETE FROM public.organization_webhooks WHERE id = $1", [webhookId]);
  check("zwykly member nie usuwa webhooka", del.rowCount === 0, del.rowCount);
});

await withUser(C, async () => {
  const listed = await db.query("SELECT id FROM public.organization_webhooks");
  check("osoba spoza organizacji nie widzi webhookow", listed.rows.length === 0, listed.rows.length);
});

await withServiceRole(async () => {
  const { rows } = await db.query(
    "UPDATE public.organization_webhooks SET last_status = 204, last_delivery_at = now() WHERE id = $1 RETURNING secret_encrypted, last_status",
    [webhookId]
  );
  check(
    "service_role czyta sekret i zapisuje status dostawy",
    rows[0]?.secret_encrypted === "enc" && rows[0]?.last_status === 204,
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const del = await db.query("DELETE FROM public.organization_webhooks WHERE id = $1", [webhookId]);
  check("owner usuwa webhook", del.rowCount === 1, del.rowCount);
});

{
  let threw = false;
  try {
    await withAnon(() => db.query("SELECT 1 FROM public.organization_webhooks LIMIT 1"));
  } catch {
    threw = true;
  }
  check("anon nie ma dostepu", threw);
}

// ------------------------------------------------------------------
section("40. plans.member_limit: miejsca w organizacji wedlug planu (migracja 051)");

{
  const seats = await db.query("SELECT id, member_limit FROM public.plans ORDER BY sort_order");
  const byId = Object.fromEntries(seats.rows.map((row) => [row.id, row.member_limit]));
  check("Free: 8 osob", byId.free === 8, byId.free);
  check("Pro: 20, Team: 50, Business: 200", byId.pro === 20 && byId.team === 50 && byId.business === 200, JSON.stringify(byId));
  check("Enterprise: bez limitu (NULL)", byId.enterprise === null, byId.enterprise);

  await withUser(A, async () => {
    const r = await db.query("SELECT member_limit FROM public.plans WHERE id = 'free'");
    check("authenticated czyta member_limit (GRANT SELECT z 015)", r.rows[0]?.member_limit === 8, JSON.stringify(r.rows));
  });
  await expectRejected(
    "authenticated nie zmieni member_limit",
    () => withUser(A, () => db.query("UPDATE public.plans SET member_limit = 1000 WHERE id = 'free'")),
    /permission denied/
  );
  await expectRejected(
    "member_limit 0 odrzucony przez CHECK",
    () => withServiceRole(() => db.query("UPDATE public.plans SET member_limit = 0 WHERE id = 'free'")),
    /check constraint/
  );
}

// ------------------------------------------------------------------
section("41. subskrypcja Free dla organizacji sprzed 015 (migracja 052)");

{
  const sub = () => db.query("SELECT plan_id FROM public.subscriptions WHERE organization_id = $1", [orgId]);
  const before = (await sub()).rows[0]?.plan_id;
  // Simulate an organization created before 015: no subscription row at all.
  await db.query("DELETE FROM public.subscriptions WHERE organization_id = $1", [orgId]);
  check("organizacja bez wiersza subskrypcji (jak sprzed 015)", (await sub()).rows.length === 0);

  const migration052 = await readFile(path.join(DB_DIR, "migrations", "052_backfill_subscriptions.sql"), "utf8");
  await db.exec(forPglite(migration052));
  check("052 zaklada brakujaca subskrypcje Free", (await sub()).rows[0]?.plan_id === "free", JSON.stringify((await sub()).rows));
  const total = Number((await db.query("SELECT count(*)::int n FROM public.subscriptions")).rows[0].n);
  await db.exec(forPglite(migration052));
  check("052 jest idempotentna", Number((await db.query("SELECT count(*)::int n FROM public.subscriptions")).rows[0].n) === total);
  const orphans = await db.query("SELECT count(*)::int n FROM public.organizations o WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id)");
  check("po 052 kazda organizacja ma subskrypcje", orphans.rows[0].n === 0, orphans.rows[0].n);
  if (before && before !== "free") await db.query("UPDATE public.subscriptions SET plan_id = $2 WHERE organization_id = $1", [orgId, before]);
}

section("42. project_label_presets: slownik etykiet projektu - czytaja czlonkowie, zmienia owner/admin (migracja 053)");

{
  let presetId;
  await withUser(A, async () => {
    const r = await db.query(
      "INSERT INTO public.project_label_presets (project_id, name, color) VALUES ($1, 'Bug', '#ef4444') RETURNING id",
      [projectId]
    );
    presetId = r.rows[0]?.id;
    check("owner dodaje preset etykiety", Boolean(presetId));

    for (const [label, sql] of [
      ["duplikat nazwy bez wzgledu na wielkosc liter", "INSERT INTO public.project_label_presets (project_id, name) VALUES ($1, 'bug')"],
      ["zly kolor (CHECK)", "INSERT INTO public.project_label_presets (project_id, name, color) VALUES ($1, 'Red', 'red')"],
      ["pusta nazwa (CHECK)", "INSERT INTO public.project_label_presets (project_id, name) VALUES ($1, '   ')"],
      ["spacje na brzegach nazwy (CHECK)", "INSERT INTO public.project_label_presets (project_id, name) VALUES ($1, ' UI')"],
    ]) {
      let threw = false;
      try {
        await db.query("SAVEPOINT s");
        await db.query(sql, [projectId]);
      } catch {
        threw = true;
      }
      await db.query("ROLLBACK TO SAVEPOINT s");
      check(`odrzucone: ${label}`, threw);
    }

    const upd = await db.query("UPDATE public.project_label_presets SET color = '#22c55e' WHERE id = $1 AND project_id = $2", [presetId, projectId]);
    check("owner zmienia kolor presetu", upd.rowCount === 1, upd.rowCount);
  });

  await withUser(D, async () => {
    const seen = await db.query("SELECT name FROM public.project_label_presets WHERE project_id = $1", [projectId]);
    check("developer widzi presety projektu", seen.rows.length === 1, seen.rows.length);

    const upd = await db.query("UPDATE public.project_label_presets SET name = 'x' WHERE id = $1 AND project_id = $2", [presetId, projectId]);
    check("developer nie zmienia presetu", upd.rowCount === 0, upd.rowCount);
    const del = await db.query("DELETE FROM public.project_label_presets WHERE id = $1 AND project_id = $2", [presetId, projectId]);
    check("developer nie usuwa presetu", del.rowCount === 0, del.rowCount);

    let threw = false;
    try {
      await db.query("SAVEPOINT s");
      await db.query("INSERT INTO public.project_label_presets (project_id, name) VALUES ($1, 'Feature')", [projectId]);
    } catch {
      threw = true;
    }
    await db.query("ROLLBACK TO SAVEPOINT s");
    check("developer nie dodaje presetu", threw);
  });

  await withUser(B, async () => {
    const seen = await db.query("SELECT id FROM public.project_label_presets WHERE project_id = $1", [projectId]);
    check("osoba spoza projektu nie widzi presetow", seen.rows.length === 0, seen.rows.length);
  });

  await withUser(A, async () => {
    let threw = false;
    try {
      await db.query("SAVEPOINT s");
      await db.query("UPDATE public.project_label_presets SET project_id = project_id WHERE id = $1", [presetId]);
    } catch (error) {
      threw = /permission denied/.test(error.message);
    }
    await db.query("ROLLBACK TO SAVEPOINT s");
    check("UPDATE project_id zablokowany (GRANT kolumnowy)", threw);

    const del = await db.query("DELETE FROM public.project_label_presets WHERE id = $1 AND project_id = $2", [presetId, projectId]);
    check("owner usuwa preset", del.rowCount === 1, del.rowCount);
  });

  let threw = false;
  try {
    await withAnon(() => db.query("SELECT 1 FROM public.project_label_presets LIMIT 1"));
  } catch {
    threw = true;
  }
  check("anon nie ma dostepu do presetow", threw);
}

section("43. api_keys.project_id/allowed_origins: klucz przypiety do projektu (migracja 054)");

{
  const insertKey = (userId, suffix, projectIdArg, origins = null) =>
    db.query(
      `INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, project_id, allowed_origins)
       VALUES ($1, 'widget', 'guidon_x', $2, '{reports:write}', $3, $4) RETURNING id, project_id, allowed_origins`,
      [userId, `hash-054-${suffix}`, projectIdArg, origins]
    );

  let ownerKey;
  await withUser(A, async () => {
    const r = await insertKey(A, "a", projectId, ["https://shop.example.com"]);
    ownerKey = r.rows[0]?.id;
    check("owner tworzy klucz przypiety do projektu z domenami", r.rows[0]?.project_id === projectId && r.rows[0]?.allowed_origins?.[0] === "https://shop.example.com", JSON.stringify(r.rows));

    let threw = false;
    try {
      await db.query("SAVEPOINT s");
      await db.query("UPDATE public.api_keys SET project_id = NULL WHERE id = $1", [ownerKey]);
    } catch (error) {
      threw = /permission denied/.test(error.message);
    }
    await db.query("ROLLBACK TO SAVEPOINT s");
    check("przypiecia nie da sie zdjac UPDATE-em (GRANT tylko revoked_at)", threw);

    const revoke = await db.query("UPDATE public.api_keys SET revoked_at = now() WHERE id = $1 RETURNING id", [ownerKey]);
    check("owner dalej moze uniewaznic klucz", revoke.rows.length === 1);
  });

  await withUser(D, async () => {
    const r = await insertKey(D, "d", projectId);
    check("developer projektu tworzy klucz przypiety do projektu", r.rows.length === 1);
  });

  await withUser(B, async () => {
    let threw = false;
    try {
      await db.query("SAVEPOINT s");
      await insertKey(B, "b", projectId);
    } catch {
      threw = true;
    }
    await db.query("ROLLBACK TO SAVEPOINT s");
    check("osoba spoza projektu nie przypnie klucza do cudzego projektu", threw);

    const r = await insertKey(B, "b2", null);
    check("klucz bez projektu dalej mozna tworzyc", r.rows.length === 1 && r.rows[0].project_id === null);
  });
}

section("44. projects.disabled_modules: wylaczane moduly projektu (migracja 055)");

{
  const { PROJECT_MODULES } = await import("../../src/lib/work/project-modules.ts");
  const def = await db.query(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'projects_disabled_modules_check'"
  );
  const allowed = [...(def.rows[0]?.def ?? "").matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
  check(
    "CHECK (055/058) == PROJECT_MODULES w project-modules.ts",
    JSON.stringify(allowed) === JSON.stringify([...PROJECT_MODULES].sort()),
    `${allowed.join(",")} vs ${[...PROJECT_MODULES].sort().join(",")}`
  );

  await withUser(A, async () => {
    const r = await db.query(
      "UPDATE public.projects SET disabled_modules = '{memory,context}' WHERE id = $1 RETURNING disabled_modules",
      [projectId]
    );
    check("owner ukrywa moduly", JSON.stringify(r.rows[0]?.disabled_modules) === '["memory","context"]', JSON.stringify(r.rows));

    const work = await db.query(
      "UPDATE public.projects SET disabled_modules = '{work,memory,context}' WHERE id = $1 RETURNING disabled_modules",
      [projectId]
    );
    check("tablice zadan (work) tez da sie wylaczyc (058)", work.rows[0]?.disabled_modules?.includes("work"), JSON.stringify(work.rows));
    await db.query("UPDATE public.projects SET disabled_modules = '{memory,context}' WHERE id = $1", [projectId]);

    let threw = false;
    try {
      await db.query("SAVEPOINT s");
      await db.query("UPDATE public.projects SET disabled_modules = '{settings}' WHERE id = $1", [projectId]);
    } catch {
      threw = true;
    }
    await db.query("ROLLBACK TO SAVEPOINT s");
    check("ustawien (settings) nie da sie wylaczyc (CHECK)", threw);
  });

  await withUser(D, async () => {
    const r = await db.query("UPDATE public.projects SET disabled_modules = '{}' WHERE id = $1", [projectId]);
    check("developer nie zmienia modulow (projects_update: owner/admin)", r.rowCount === 0, r.rowCount);
    const seen = await db.query("SELECT disabled_modules FROM public.projects WHERE id = $1", [projectId]);
    check("developer widzi ukryte moduly (potrzebne do nawigacji)", seen.rows[0]?.disabled_modules?.length === 2);
  });

  await withUser(A, async () => {
    await db.query("UPDATE public.projects SET disabled_modules = '{}' WHERE id = $1", [projectId]);
  });
}

section("45. discord_user_links: osobiste logowanie do bota Discord (migracja 057)");

{
  const discordId = "123456789012345678";

  await withUser(A, async () => {
    const r = await db.query(
      // Same columns as linkDiscordUser's upsertRow insert (updated_at included).
      `INSERT INTO public.discord_user_links (discord_user_id, user_id, discord_username, api_key_encrypted, updated_at)
       VALUES ($1, $2, 'alice', 'enc-a', now()) RETURNING discord_user_id`,
      [discordId, A]
    );
    check("uzytkownik podpina swoje konto Discord", r.rows.length === 1);
    const seen = await db.query("SELECT discord_username FROM public.discord_user_links WHERE discord_user_id = $1", [discordId]);
    check("widzi swoj wiersz", seen.rows[0]?.discord_username === "alice");
    check(
      "nie czyta zaszyfrowanego klucza (brak grantu kolumny)",
      await throwsInSavepoint("SELECT api_key_encrypted FROM public.discord_user_links")
    );
    const upd = await db.query(
      "UPDATE public.discord_user_links SET api_key_encrypted = 'enc-a2' WHERE discord_user_id = $1",
      [discordId]
    );
    check("podmienia swoj klucz (ponowne /guidon-login)", upd.rowCount === 1);
    check(
      "nie przepisuje wiersza na kogos innego (WITH CHECK)",
      await throwsInSavepoint("UPDATE public.discord_user_links SET user_id = $2 WHERE discord_user_id = $1", [discordId, B])
    );
  });

  await withUser(B, async () => {
    const seen = await db.query("SELECT 1 FROM public.discord_user_links WHERE discord_user_id = $1", [discordId]);
    check("inny uzytkownik nie widzi cudzego wiersza", seen.rows.length === 0);
    const upd = await db.query(
      "UPDATE public.discord_user_links SET api_key_encrypted = 'enc-b' WHERE discord_user_id = $1",
      [discordId]
    );
    check("inny uzytkownik nie przejmuje konta Discord (UPDATE 0 wierszy)", upd.rowCount === 0);
    check(
      "INSERT tego samego konta Discord przez innego uzytkownika -> konflikt klucza",
      await throwsInSavepoint(
        `INSERT INTO public.discord_user_links (discord_user_id, user_id, api_key_encrypted) VALUES ($1, $2, 'enc-b')`,
        [discordId, B]
      )
    );
    check(
      "nie podpina konta Discord na cudze user_id (WITH CHECK)",
      await throwsInSavepoint(
        `INSERT INTO public.discord_user_links (discord_user_id, user_id, api_key_encrypted) VALUES ('999', $1, 'x')`,
        [A]
      )
    );
    const del = await db.query("DELETE FROM public.discord_user_links WHERE discord_user_id = $1", [discordId]);
    check("inny uzytkownik nie usuwa cudzego wiersza", del.rowCount === 0);
  });

  await withServiceRole(async () => {
    const r = await db.query("SELECT api_key_encrypted FROM public.discord_user_links WHERE discord_user_id = $1", [discordId]);
    check("bot (service_role) czyta klucz", r.rows[0]?.api_key_encrypted === "enc-a2");
  });

  await withAnon(async () => {
    check("anon nie ma dostepu", await throwsInSavepoint("SELECT discord_user_id FROM public.discord_user_links"));
  });

  await withUser(A, async () => {
    const del = await db.query("DELETE FROM public.discord_user_links WHERE discord_user_id = $1", [discordId]);
    check("uzytkownik usuwa swoj wiersz", del.rowCount === 1);
  });
}

section("46. ai_accounts: konta AI, zapis tylko przez serwer (migracja 059)");

{
  const bot = "bbbbbbbb-0000-4000-8000-000000000059";
  const outsider = "eeeeeeee-0000-4000-8000-000000000059";
  await withServiceRole(async () => {
    // Like createAiAccount: a user with no password and an .invalid address.
    await db.query(
      "INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES ($1, $2, now(), $3)",
      [bot, "ai-test@agents.guidon.invalid", JSON.stringify({ full_name: "Claude - backend" })]
    );
    await db.query("INSERT INTO auth.users (id, email) VALUES ($1, 'outsider@example.test')", [outsider]);
    const r = await db.query(
      "INSERT INTO public.ai_accounts (user_id, organization_id, created_by) VALUES ($1, $2, $3) RETURNING user_id",
      [bot, orgId, A]
    );
    check("serwer (service_role) zaklada konto AI", r.rows.length === 1);
  });

  await withUser(A, async () => {
    const seen = await db.query("SELECT created_by FROM public.ai_accounts WHERE user_id = $1", [bot]);
    check("czlonek organizacji widzi konto AI", seen.rows[0]?.created_by === A);
    const profile = await db.query("SELECT full_name FROM public.profiles WHERE id = $1", [bot]);
    check(
      "profil konta AI widoczny bez czlonkostwa (historia po wylaczeniu)",
      profile.rows[0]?.full_name === "Claude - backend",
      JSON.stringify(profile.rows)
    );
    check(
      "admin nie oznacza dowolnego profilu jako konto AI (brak INSERT)",
      await throwsInSavepoint("INSERT INTO public.ai_accounts (user_id, organization_id) VALUES ($1, $2)", [B, orgId])
    );
    check(
      "ani nie zmienia konta AI (brak UPDATE)",
      await throwsInSavepoint("UPDATE public.ai_accounts SET created_by = $2 WHERE user_id = $1", [bot, B])
    );
  });

  await withUser(outsider, async () => {
    const seen = await db.query("SELECT 1 FROM public.ai_accounts WHERE user_id = $1", [bot]);
    check("ktos spoza organizacji nie widzi konta AI", seen.rows.length === 0);
    const profile = await db.query("SELECT 1 FROM public.profiles WHERE id = $1", [bot]);
    check("ani jego profilu", profile.rows.length === 0);
  });
}

section("47. dowolne kolumny i priorytety + edycja cudzych zadan (migracja 060)");

{
  let taskId;
  await withUser(A, async () => {
    const t = await db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'workflow 060') RETURNING id, is_done", [projectId]);
    taskId = t.rows[0].id;
    check("nowe zadanie nie jest zrobione", t.rows[0].is_done === false);

    await db.query(
      "INSERT INTO public.project_board_columns (project_id, status, label, sort_order, is_done) VALUES ($1, 'qa', 'QA', 7, false), ($1, 'shipped', 'Shipped', 8, true)",
      [projectId]
    );
    const qa = await db.query("UPDATE public.tasks SET status = 'qa' WHERE id = $1 RETURNING status, is_done", [taskId]);
    check("zadanie wchodzi do wlasnej kolumny", qa.rows[0]?.status === "qa" && qa.rows[0].is_done === false, JSON.stringify(qa.rows));
    const shipped = await db.query("UPDATE public.tasks SET status = 'shipped' WHERE id = $1 RETURNING is_done", [taskId]);
    check("kolumna z is_done -> zadanie zrobione", shipped.rows[0]?.is_done === true);
    await db.query("UPDATE public.project_board_columns SET is_done = false WHERE project_id = $1 AND status = 'shipped'", [projectId]);
    const after = await db.query("SELECT is_done FROM public.tasks WHERE id = $1", [taskId]);
    check("zmiana is_done kolumny przelicza zadania", after.rows[0]?.is_done === false);
    const done = await db.query("UPDATE public.tasks SET status = 'done' WHERE id = $1 RETURNING is_done", [taskId]);
    check("wbudowane done zawsze zrobione", done.rows[0]?.is_done === true);

    check(
      "nieznany status innego projektu odrzucony",
      await throwsInSavepoint("UPDATE public.tasks SET status = 'nie_istnieje' WHERE id = $1", [taskId])
    );
    await db.query("UPDATE public.tasks SET status = 'qa' WHERE id = $1", [taskId]);
    check(
      "nie da sie usunac kolumny z zadaniami",
      await throwsInSavepoint("DELETE FROM public.project_board_columns WHERE project_id = $1 AND status = 'qa'", [projectId])
    );
    const delEmpty = await db.query("DELETE FROM public.project_board_columns WHERE project_id = $1 AND status = 'shipped'", [projectId]);
    check("pusta wlasna kolumna sie usuwa", delEmpty.rowCount === 1);

    await db.query("INSERT INTO public.project_task_priorities (project_id, key, label, color, rank) VALUES ($1, 'blocker', 'Blocker', '#ff0000', -1)", [projectId]);
    const pr = await db.query("UPDATE public.tasks SET priority = 'blocker' WHERE id = $1 RETURNING priority", [taskId]);
    check("wlasny priorytet dziala", pr.rows[0]?.priority === "blocker");
    check(
      "nieznany priorytet odrzucony",
      await throwsInSavepoint("UPDATE public.tasks SET priority = 'whatever' WHERE id = $1", [taskId])
    );
    check(
      "nie da sie usunac priorytetu w uzyciu",
      await throwsInSavepoint("DELETE FROM public.project_task_priorities WHERE project_id = $1 AND key = 'blocker'", [projectId])
    );
  });

  await withUser(D, async () => {
    const moved = await db.query("UPDATE public.tasks SET status = 'todo' WHERE id = $1 RETURNING status", [taskId]);
    check("developer przesuwa zadanie utworzone przez kogos innego (poprawka validate_task)", moved.rows[0]?.status === "todo", JSON.stringify(moved.rows));
    check(
      "ale nie zmienia created_by",
      await throwsInSavepoint("UPDATE public.tasks SET created_by = $2 WHERE id = $1", [taskId, D])
    );
    check(
      "developer nie dodaje kolumn (owner/admin)",
      await throwsInSavepoint("INSERT INTO public.project_board_columns (project_id, status, label, sort_order) VALUES ($1, 'dev_col', 'X', 9)", [projectId])
    );
    check(
      "ani priorytetow",
      await throwsInSavepoint("INSERT INTO public.project_task_priorities (project_id, key, rank) VALUES ($1, 'dev_p', 9)", [projectId])
    );
    const seen = await db.query("SELECT label FROM public.project_task_priorities WHERE project_id = $1", [projectId]);
    check("developer widzi priorytety projektu", seen.rows[0]?.label === "Blocker");
  });
}

section("48. usuwanie ukonczonych zadan po N dniach (migracja 061)");

{
  const stranger = "eeeeeeee-0000-4000-8000-000000000061";
  let oldDone, freshDone, openTask, oldSub, openParent, doneSubOfOpen;
  const insert = (title, status = null, parent = null) =>
    db.query(
      "INSERT INTO public.tasks (project_id, title, status, parent_task_id) VALUES ($1, $2, COALESCE($3, 'todo'), $4) RETURNING id, done_at",
      [projectId, title, status, parent]
    );

  await withUser(A, async () => {
    const d = await insert("061 old done", "done");
    oldDone = d.rows[0].id;
    check("zadanie utworzone jako done dostaje done_at", d.rows[0].done_at !== null);
    freshDone = (await insert("061 fresh done", "done")).rows[0].id;
    openTask = (await insert("061 open")).rows[0].id;
    const o = await insert("061 open parent");
    openParent = o.rows[0].id;
    check("otwarte zadanie nie ma done_at", o.rows[0].done_at === null);
    oldSub = (await insert("061 sub", null, oldDone)).rows[0].id;
    doneSubOfOpen = (await insert("061 done sub", "done", openParent)).rows[0].id;

    const back = await db.query("UPDATE public.tasks SET done_at = now() - interval '400 days' WHERE id = $1 RETURNING done_at", [oldDone]);
    check("klient nie moze postarzyc done_at", Date.now() - new Date(back.rows[0].done_at).getTime() < 60_000, back.rows[0].done_at);
    const reopened = await db.query("UPDATE public.tasks SET status = 'todo' WHERE id = $1 RETURNING done_at", [freshDone]);
    check("powrot do pracy czysci done_at", reopened.rows[0].done_at === null);
    await db.query("UPDATE public.tasks SET status = 'done' WHERE id = $1", [freshDone]);

    const off = await db.query("SELECT public.purge_finished_tasks($1) AS n", [projectId]);
    check("wylaczone ustawienie niczego nie usuwa", off.rows[0].n === 0);
  });

  await withUser(D, async () => {
    const res = await db.query("UPDATE public.projects SET done_cleanup_days = 1 WHERE id = $1 RETURNING id", [projectId]);
    check("developer nie zmienia ustawienia", res.rows.length === 0);
  });

  await withUser(A, async () => {
    check("zle ustawienie odrzucone", await throwsInSavepoint("UPDATE public.projects SET done_cleanup_days = 0 WHERE id = $1", [projectId]));
    const set = await db.query("UPDATE public.projects SET done_cleanup_days = 30 WHERE id = $1 RETURNING done_cleanup_days", [projectId]);
    check("owner wlacza usuwanie po 30 dniach", set.rows[0]?.done_cleanup_days === 30);
  });

  // Postarzenie z pominieciem triggera - tylko wlasciciel tabeli tak moze.
  await db.exec("ALTER TABLE public.tasks DISABLE TRIGGER workflow_set_task_done_at");
  await db.query("UPDATE public.tasks SET done_at = now() - interval '40 days' WHERE id = ANY($1)", [[oldDone, doneSubOfOpen]]);
  await db.exec("ALTER TABLE public.tasks ENABLE TRIGGER workflow_set_task_done_at");

  await withUser(stranger, async () => {
    const n = await db.query("SELECT public.purge_finished_tasks($1) AS n", [projectId]);
    check("ktos bez dostepu do projektu niczego nie usuwa", n.rows[0].n === 0);
  });

  await withUser(D, async () => {
    const n = await db.query("SELECT public.purge_finished_tasks($1) AS n", [projectId]);
    check("czlonek projektu uruchamia czyszczenie: 1 stare zadanie", n.rows[0].n === 1, n.rows[0].n);
  });

  await withServiceRole(async () => {
    const left = await db.query("SELECT id FROM public.tasks WHERE id = ANY($1)", [[oldDone, oldSub, freshDone, openTask, openParent, doneSubOfOpen]]);
    const ids = new Set(left.rows.map((r) => r.id));
    check("stare ukonczone zadanie usuniete", !ids.has(oldDone));
    check("razem z subtaskiem", !ids.has(oldSub));
    check("swiezo ukonczone zostaje", ids.has(freshDone));
    check("otwarte zostaje", ids.has(openTask) && ids.has(openParent));
    check("stary ukonczony subtask otwartego zadania zostaje", ids.has(doneSubOfOpen));
    await db.query("UPDATE public.projects SET done_cleanup_days = NULL WHERE id = $1", [projectId]);
  });
}

section("49. kody promocyjne: plan za darmo na N dni (migracja 062)");

{
  const orgs = [];
  for (const slug of ["promo-a", "promo-b", "promo-c"]) {
    const o = await withUser(A, () => db.query("INSERT INTO public.organizations (name, slug) VALUES ($1, $1) RETURNING id", [slug]));
    orgs.push(o.rows[0].id);
  }
  const [orgA, orgB, orgC] = orgs;
  const redeem = (code, org) =>
    withServiceRole(async () => (await db.query("SELECT * FROM public.redeem_promo_code($1, $2, $3)", [code, org, A])).rows[0]);

  await withServiceRole(async () => {
    await db.query(
      `INSERT INTO public.promo_codes (code, plan_id, duration_days, max_redemptions) VALUES
         ('PRO30', 'pro', 30, 2), ('PRO10', 'pro', 10, NULL), ('TEAM5', 'team', 5, NULL)`
    );
    await db.query("INSERT INTO public.promo_codes (code, plan_id, duration_days, active) VALUES ('OFF1', 'pro', 30, false)");
    await db.query("INSERT INTO public.promo_codes (code, plan_id, duration_days, expires_at) VALUES ('OLD1', 'pro', 30, now() - interval '1 day')");
  });

  await withUser(A, async () => {
    check("uzytkownik nie widzi kodow", await throwsInSavepoint("SELECT * FROM public.promo_codes"));
    check("ani nie realizuje kodu sam", await throwsInSavepoint("SELECT * FROM public.redeem_promo_code('PRO30', $1, $2)", [orgA, A]));
    const own = await db.query("UPDATE public.subscriptions SET promo_plan_id = 'business', promo_until = now() + interval '1 year' WHERE organization_id = $1 RETURNING 1", [orgA]).catch(() => ({ rows: [] }));
    check("owner nie daje sobie planu przez subscriptions", own.rows.length === 0);
  });

  const first = await redeem(" pro30 ", orgA);
  check("kod dziala (male litery, spacje)", first.error === null && first.plan_id === "pro", JSON.stringify(first));
  const days = (until) => Math.round((new Date(until).getTime() - Date.now()) / 86400000);
  check("na 30 dni", days(first.granted_until) === 30, first.granted_until);
  check("drugi raz w tej samej organizacji: already_redeemed", (await redeem("PRO30", orgA)).error === "already_redeemed");
  const stacked = await redeem("PRO10", orgA);
  check("drugi kod na ten sam plan dodaje dni", stacked.error === null && days(stacked.granted_until) === 40, stacked.granted_until);
  check("kod na lepszy plan zastepuje promocje", (await redeem("TEAM5", orgA)).plan_id === "team");
  check("inna organizacja: PRO10 i TEAM5", (await redeem("PRO10", orgB)).error === null && (await redeem("TEAM5", orgB)).error === null);
  check("slabszy kod przy trwajacej lepszej promocji: has_better_plan", (await redeem("PRO30", orgB)).error === "has_better_plan");

  check("nieznany kod", (await redeem("NOPE", orgC)).error === "not_found");
  check("wylaczony kod", (await redeem("OFF1", orgC)).error === "inactive");
  check("przeterminowany kod", (await redeem("OLD1", orgC)).error === "expired");

  await withServiceRole(() => db.query("UPDATE public.subscriptions SET plan_id = 'business', status = 'active' WHERE organization_id = $1", [orgC]));
  check("oplacony lepszy plan: has_better_plan i kod niezuzyty", (await redeem("PRO30", orgC)).error === "has_better_plan");
  await withServiceRole(() => db.query("UPDATE public.subscriptions SET plan_id = 'free' WHERE organization_id = $1", [orgC]));
  check("drugie uzycie PRO30 (limit 2)", (await redeem("PRO30", orgC)).error === null);
  check("trzecie: used_up", (await redeem("PRO30", orgB)).error === "used_up");

  const sub = await withServiceRole(async () => (await db.query("SELECT promo_plan_id FROM public.subscriptions WHERE organization_id = $1", [orgB])).rows[0]);
  check("used_up niczego nie zmienia w subskrypcji", sub.promo_plan_id === "team");
  const count = await withServiceRole(async () => (await db.query("SELECT redemption_count FROM public.promo_codes WHERE code = 'PRO30'")).rows[0]);
  check("licznik uzyc = 2", count.redemption_count === 2, count.redemption_count);
}

section("50. zadania cykliczne (migracja 063)");

{
  await withUser(A, async () => {
    const t = await db.query(
      "INSERT INTO public.tasks (project_id, title, recurrence_rule, recurrence_interval) VALUES ($1, '063 weekly', 'weekly', 2) RETURNING id, recurrence_rule",
      [projectId]
    );
    const taskId = t.rows[0].id;
    check("zadanie co 2 tygodnie zapisane", t.rows[0].recurrence_rule === "weekly");
    check("regula bez odstepu odrzucona", await throwsInSavepoint("UPDATE public.tasks SET recurrence_interval = NULL WHERE id = $1", [taskId]));
    check("nieznana regula odrzucona", await throwsInSavepoint("UPDATE public.tasks SET recurrence_rule = 'yearly' WHERE id = $1", [taskId]));
    check("odstep 0 odrzucony", await throwsInSavepoint("UPDATE public.tasks SET recurrence_interval = 0 WHERE id = $1", [taskId]));
    check(
      "subtask nie moze sie powtarzac",
      await throwsInSavepoint(
        "INSERT INTO public.tasks (project_id, title, parent_task_id, recurrence_rule, recurrence_interval) VALUES ($1, 'sub', $2, 'weekly', 1)",
        [projectId, taskId]
      )
    );
    const next = await db.query("INSERT INTO public.tasks (project_id, title, recurred_from) VALUES ($1, '063 next', $2) RETURNING id", [projectId, taskId]);
    check("nastepne wystapienie z recurred_from", next.rows.length === 1);
    check(
      "drugie nastepne wystapienie tego samego zadania odrzucone (unikalne)",
      await throwsInSavepoint("INSERT INTO public.tasks (project_id, title, recurred_from) VALUES ($1, '063 dup', $2)", [projectId, taskId])
    );
    const off = await db.query("UPDATE public.tasks SET recurrence_rule = NULL, recurrence_interval = NULL WHERE id = $1 RETURNING recurrence_rule", [taskId]);
    check("wylaczenie powtarzania", off.rows[0].recurrence_rule === null);
  });
}

section("51. cudze projekty niewidoczne, takze 'public' (migracja 064)");

{
  const stranger = "eeeeeeee-0000-4000-8000-000000000065";
  // 'public' itself is rejected since 067 (section 54); the widest
  // visibility left must still keep someone outside the organization out.
  await withServiceRole(() => db.query("UPDATE public.projects SET visibility = 'organization' WHERE id = $1", [projectId]));
  await withUser(stranger, async () => {
    const p = await db.query("SELECT id FROM public.projects WHERE id = $1", [projectId]);
    check("obcy nie widzi projektu (najszersza widocznosc)", p.rows.length === 0, p.rows.length);
    const t = await db.query("SELECT id FROM public.tasks WHERE project_id = $1", [projectId]);
    check("ani jego zadan", t.rows.length === 0, t.rows.length);
    const all = await db.query("SELECT id FROM public.projects");
    check("lista projektow obcego jest pusta", all.rows.length === 0, all.rows.length);
  });
  await withUser(A, async () => {
    const p = await db.query("SELECT id FROM public.projects WHERE id = $1", [projectId]);
    check("czlonek dalej widzi swoj projekt", p.rows.length === 1);
  });
  await withServiceRole(() => db.query("UPDATE public.projects SET visibility = 'private' WHERE id = $1", [projectId]));
}

section("52. przypiete projekty (migracja 065)");

{
  await withUser(A, async () => {
    const set = await db.query("UPDATE public.profiles SET pinned_project_ids = ARRAY[$2::uuid] WHERE id = $1 RETURNING pinned_project_ids", [A, projectId]);
    check("wlasciciel profilu przypina projekt", set.rows[0]?.pinned_project_ids?.length === 1);
    check(
      "najwyzej 3 przypiete",
      await throwsInSavepoint("UPDATE public.profiles SET pinned_project_ids = ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()] WHERE id = $1", [A])
    );
    const other = await db.query("UPDATE public.profiles SET pinned_project_ids = '{}' WHERE id = $1 RETURNING id", [B]);
    check("nie zmienia przypiec kogos innego", other.rows.length === 0);
    await db.query("UPDATE public.profiles SET pinned_project_ids = '{}' WHERE id = $1", [A]);
  });
}

section("53. RLS wlaczone na kazdej tabeli public (migracja 066)");

{
  const stranger = "eeeeeeee-0000-4000-8000-000000000066";
  const { rows: off } = await db.query(
    "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND NOT relrowsecurity"
  );
  check("po migracjach zadna tabela public nie ma wylaczonego RLS", off.length === 0, off.map((r) => r.relname).join(","));

  // Odtworzenie zgloszenia: projects bez RLS -> obcy widzi cudze projekty.
  await db.exec("ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY");
  const leaked = await withUser(stranger, async () => (await db.query("SELECT id FROM public.projects")).rows.length);
  check("bez RLS na projects obcy widzi cudze projekty (odtworzenie bledu)", leaked > 0, leaked);
  const tasksSeen = await withUser(stranger, async () => (await db.query("SELECT id FROM public.tasks")).rows.length);
  check("...a ich zadania sa puste (tasks ma RLS) - jak w zgloszeniu", tasksSeen === 0, tasksSeen);

  const sql066 = await readFile(path.join(DB_DIR, "migrations", "066_enforce_rls_everywhere.sql"), "utf8");
  await db.exec(forPglite(sql066));
  const after = await withUser(stranger, async () => (await db.query("SELECT id FROM public.projects")).rows.length);
  check("066 wlacza RLS z powrotem - obcy nie widzi nic", after === 0, after);
}

section("54. widocznosc projektu w organizacji (migracja 067)");

{
  const M = "eeeeeeee-0000-4000-8000-000000000067";
  await withServiceRole(() =>
    db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, 'm067@example.test', '{}') ON CONFLICT DO NOTHING", [M])
  );
  let org, shared, hidden;
  await withUser(A, async () => {
    org = (await db.query("INSERT INTO public.organizations (name, slug) VALUES ('Vis 067', 'vis-067') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'member')", [org, M]);
    const s = await db.query("INSERT INTO public.projects (organization_id, name, slug) VALUES ($1, 'Shared', 'shared-067') RETURNING id, visibility", [org]);
    shared = s.rows[0].id;
    check("nowy projekt domyslnie widoczny dla organizacji", s.rows[0].visibility === "organization", s.rows[0].visibility);
    hidden = (
      await db.query("INSERT INTO public.projects (organization_id, name, slug, visibility) VALUES ($1, 'Hidden', 'hidden-067', 'private') RETURNING id", [org])
    ).rows[0].id;
    check("'public' juz niedozwolone", await throwsInSavepoint("UPDATE public.projects SET visibility = 'public' WHERE id = $1", [shared]));
  });

  await withUser(M, async () => {
    const seen = (await db.query("SELECT id FROM public.projects WHERE organization_id = $1", [org])).rows.map((r) => r.id);
    check("czlonek organizacji widzi projekt 'organization'", seen.includes(shared));
    check("ale nie 'private'", !seen.includes(hidden));
    const upd = await db.query("UPDATE public.projects SET visibility = 'private' WHERE id = $1 RETURNING id", [shared]);
    check("czlonek bez roli w projekcie nie zmienia widocznosci", upd.rows.length === 0);
  });

  await withUser(A, async () => {
    const upd = await db.query("UPDATE public.projects SET visibility = 'private' WHERE id = $1 RETURNING visibility", [shared]);
    check("owner projektu przelacza widocznosc", upd.rows[0]?.visibility === "private");
    await db.query("UPDATE public.organization_members SET role = 'admin' WHERE organization_id = $1 AND user_id = $2", [org, M]);
  });

  await withUser(M, async () => {
    const seen = (await db.query("SELECT id FROM public.projects WHERE organization_id = $1", [org])).rows.map((r) => r.id);
    check("admin organizacji widzi kazdy projekt, takze 'private'", seen.includes(shared) && seen.includes(hidden));
  });
}

section("55. zespol projektu widoczny dla kazdego, kto widzi projekt (migracja 069)");

{
  const M = "eeeeeeee-0000-4000-8000-000000000069";
  const S = "eeeeeeee-0000-4000-8000-000000000169";
  await withServiceRole(() =>
    db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, 'm069@example.test', '{}'), ($2, 's069@example.test', '{}') ON CONFLICT DO NOTHING", [M, S])
  );
  let shared, hidden;
  await withUser(A, async () => {
    const org = (await db.query("INSERT INTO public.organizations (name, slug) VALUES ('Team 069', 'team-069') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO public.organization_members (organization_id, user_id, role) VALUES ($1, $2, 'member')", [org, M]);
    shared = (await db.query("INSERT INTO public.projects (organization_id, name, slug, visibility) VALUES ($1, 'Shared 069', 'shared-069', 'organization') RETURNING id", [org])).rows[0].id;
    hidden = (await db.query("INSERT INTO public.projects (organization_id, name, slug, visibility) VALUES ($1, 'Hidden 069', 'hidden-069', 'private') RETURNING id", [org])).rows[0].id;
  });
  await withUser(M, async () => {
    const seen = (await db.query("SELECT project_id FROM public.project_members WHERE project_id = ANY($1)", [[shared, hidden]])).rows.map((r) => r.project_id);
    check("czlonek organizacji widzi zespol projektu 'organization'", seen.includes(shared));
    check("ale nie zespol projektu 'private'", !seen.includes(hidden));
  });
  await withUser(S, async () => {
    const seen = await db.query("SELECT 1 FROM public.project_members WHERE project_id = ANY($1)", [[shared, hidden]]);
    check("ktos spoza organizacji nie widzi zadnego zespolu", seen.rows.length === 0);
  });
}

section("56. jezyk projektu (migracja 070)");

{
  await withUser(A, async () => {
    const set = await db.query("UPDATE public.projects SET language = 'pt-BR' WHERE id = $1 RETURNING language", [projectId]);
    check("owner ustawia jezyk projektu", set.rows[0]?.language === "pt-BR");
    check("zly kod jezyka odrzucony", await throwsInSavepoint("UPDATE public.projects SET language = 'polish' WHERE id = $1", [projectId]));
    const auto = await db.query("UPDATE public.projects SET language = NULL WHERE id = $1 RETURNING language", [projectId]);
    check("NULL = automatycznie", auto.rows[0]?.language === null);
  });
  await withUser(D, async () => {
    const res = await db.query("UPDATE public.projects SET language = 'de' WHERE id = $1 RETURNING id", [projectId]);
    check("developer nie zmienia jezyka projektu", res.rows.length === 0);
  });
}

section("57. ceny tygodniowe/miesieczne/roczne, trial raz na organizacje, karencja (migracja 071)");

{
  const sql071 = await readFile(path.join(DB_DIR, "migrations", "071_billing_intervals_trial_grace.sql"), "utf8");
  await withServiceRole(async () => {
    await db.query("UPDATE public.plans SET stripe_price_id = 'price_071_pro_month' WHERE id = 'pro'");
    await db.query("UPDATE public.subscriptions SET stripe_subscription_id = 'sub_071', status = 'past_due', trial_used_at = NULL, past_due_since = NULL WHERE organization_id = $1", [orgId]);
  });
  await db.exec(forPglite(sql071));
  await db.exec(forPglite(sql071));
  const prices = await withServiceRole(() => db.query("SELECT plan_id, billing_interval FROM public.plan_prices WHERE stripe_price_id = 'price_071_pro_month'"));
  check("071 przepisuje plans.stripe_price_id jako cene miesieczna", prices.rows.length === 1 && prices.rows[0].plan_id === "pro" && prices.rows[0].billing_interval === "month", JSON.stringify(prices.rows));
  const sub = await withServiceRole(() => db.query("SELECT trial_used_at, past_due_since FROM public.subscriptions WHERE organization_id = $1", [orgId]));
  check("organizacja z dawna subskrypcja ma trial juz wykorzystany", sub.rows[0].trial_used_at !== null);
  check("zalegla platnosc dostaje date poczatku karencji", sub.rows[0].past_due_since !== null);

  await withServiceRole(async () => {
    await db.query("INSERT INTO public.plan_prices (stripe_price_id, plan_id, billing_interval, amount_cents) VALUES ('price_071_pro_year', 'pro', 'year', 39000)");
    check(
      "druga aktywna cena roczna dla planu odrzucona",
      await throwsInSavepoint("INSERT INTO public.plan_prices (stripe_price_id, plan_id, billing_interval, amount_cents) VALUES ('price_071_pro_year2', 'pro', 'year', 35000)")
    );
    await db.query("UPDATE public.plan_prices SET active = false WHERE stripe_price_id = 'price_071_pro_year'");
    await db.query("INSERT INTO public.plan_prices (stripe_price_id, plan_id, billing_interval, amount_cents) VALUES ('price_071_pro_year2', 'pro', 'year', 35000)");
    check("po wylaczeniu starej ceny nowa wchodzi", true);
    check("okres 'day' odrzucony", await throwsInSavepoint("INSERT INTO public.plan_prices (stripe_price_id, plan_id, billing_interval, amount_cents) VALUES ('price_071_day', 'pro', 'day', 100)"));
    check("subscriptions.billing_interval sprawdzany", await throwsInSavepoint("UPDATE public.subscriptions SET billing_interval = 'quarter' WHERE organization_id = $1", [orgId]));
    await db.query("UPDATE public.subscriptions SET status = 'active', stripe_subscription_id = NULL, past_due_since = NULL WHERE organization_id = $1", [orgId]);
  });

  await withUser(A, async () => {
    const seen = await db.query("SELECT stripe_price_id FROM public.plan_prices WHERE plan_id = 'pro'");
    check("zalogowany czyta ceny (jak plans)", seen.rows.length >= 3, seen.rows.length);
    check("ale ich nie dopisuje", await throwsInSavepoint("INSERT INTO public.plan_prices (stripe_price_id, plan_id, billing_interval, amount_cents) VALUES ('price_hack', 'pro', 'week', 1)"));
    check("ani nie oznacza sobie trialu jako niewykorzystanego", await throwsInSavepoint("UPDATE public.subscriptions SET trial_used_at = NULL WHERE organization_id = $1", [orgId]));
  });
}

section("58. Idempotency-Key i stronicowanie zadan w SQL (migracja 072)");

{
  const stranger = "eeeeeeee-0000-4000-8000-000000000072";
  await withUser(stranger, async () => {
    check(
      "authenticated nie czyta zapisanych odpowiedzi",
      await throwsInSavepoint("SELECT * FROM public.api_idempotency_keys")
    );
  });
  await withServiceRole(async () => {
    await db.query("INSERT INTO public.api_idempotency_keys (scope, idempotency_key, request_hash) VALUES ('s', 'k', 'h')");
    check(
      "ten sam klucz w tym samym scope drugi raz odrzucony",
      await throwsInSavepoint("INSERT INTO public.api_idempotency_keys (scope, idempotency_key, request_hash) VALUES ('s', 'k', 'h2')")
    );
    check("pusty klucz odrzucony", await throwsInSavepoint("INSERT INTO public.api_idempotency_keys (scope, idempotency_key, request_hash) VALUES ('s', '', 'h')"));
    await db.query("DELETE FROM public.api_idempotency_keys WHERE scope = 's'");
  });

  let ids = [];
  await withUser(A, async () => {
    const created = await db.query(
      "INSERT INTO public.tasks (project_id, title, created_at) SELECT $1, 'page ' || g, '2026-10-21 01:02:03.123456+00' FROM generate_series(1, 5) g RETURNING id",
      [projectId]
    );
    ids = created.rows.map((r) => r.id);
    const page = async (after, at) =>
      (await db.query("SELECT id FROM public.list_project_tasks_page($1, 2, $2, $3)", [projectId, after, at])).rows.map((r) => r.id);
    const all = (await db.query("SELECT id FROM public.list_project_tasks_page($1, 1000)", [projectId])).rows.map((r) => r.id);
    const seen = [];
    let after = null;
    for (let i = 0; i < 100; i++) {
      const rows = await page(after, null);
      seen.push(...rows);
      if (rows.length < 2) break;
      after = rows[rows.length - 1];
    }
    check("strony po 2 skladaja sie w pelna liste (te same znaczniki czasu)", JSON.stringify(seen) === JSON.stringify(all), `${seen.length}/${all.length}`);
    check("wszystkie 5 zadan z ta sama mikrosekunda sa na liscie", ids.every((id) => all.includes(id)));

    const cut = all.indexOf(ids[2]);
    const at = (await db.query("SELECT created_at FROM public.tasks WHERE id = $1", [all[cut]])).rows[0].created_at;
    const before = await page(all[cut], null);
    await db.query("DELETE FROM public.tasks WHERE id = $1", [all[cut]]);
    const afterDelete = await page(all[cut], at);
    check("kursor na usuniete zadanie dalej dziala (czas z kursora)", JSON.stringify(before) === JSON.stringify(afterDelete), `${before} vs ${afterDelete}`);
    const capped = (await db.query("SELECT count(*)::int n FROM public.list_project_tasks_page($1, 100000)", [projectId])).rows[0].n;
    check("limit obciety do 1001", capped <= 1001);
  });
  await withUser(stranger, async () => {
    const rows = (await db.query("SELECT id FROM public.list_project_tasks_page($1, 10)", [projectId])).rows;
    check("obcy nie widzi zadan przez funkcje (RLS)", rows.length === 0, rows.length);
  });
}

section("59. serwer autoryzacji OAuth 2.1 (migracja 073)");

{
  const stranger = "eeeeeeee-0000-4000-8000-000000000073";
  for (const table of ["oauth_clients", "oauth_grants", "oauth_codes", "oauth_refresh_tokens", "oauth_client_assertions"]) {
    await withUser(A, async () => {
      check(`authenticated nie czyta ${table}`, await throwsInSavepoint(`SELECT * FROM public.${table}`));
    });
  }

  let grantId, keyId;
  await withServiceRole(async () => {
    await db.query("INSERT INTO public.oauth_clients (client_id, kind, client_name, redirect_uris) VALUES ('gdc_test', 'dcr', 'Test client', '{https://a.example/cb}')");
    check(
      "klient bez redirect_uris odrzucony",
      await throwsInSavepoint("INSERT INTO public.oauth_clients (client_id, kind, client_name, redirect_uris) VALUES ('gdc_x', 'dcr', 'x', '{}')")
    );
    check(
      "nieznany rodzaj klienta odrzucony",
      await throwsInSavepoint("INSERT INTO public.oauth_clients (client_id, kind, client_name, redirect_uris) VALUES ('gdc_y', 'secret', 'x', '{https://a.example/cb}')")
    );
    grantId = (
      await db.query("INSERT INTO public.oauth_grants (client_id, user_id, client_name, scopes) VALUES ('gdc_test', $1, 'Test client', '{tasks:read}') RETURNING id", [A])
    ).rows[0].id;
    check(
      "kod z blednym code_challenge odrzucony",
      await throwsInSavepoint(
        "INSERT INTO public.oauth_codes (code_hash, grant_id, redirect_uri, code_challenge, expires_at) VALUES ('h', $1, 'https://a.example/cb', 'short', now())",
        [grantId]
      )
    );
    keyId = (
      await db.query(
        "INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, oauth_grant_id, expires_at) VALUES ($1, 'Test client (OAuth)', 'guidon_test', 'hash073', '{tasks:read}', $2, now() + interval '1 hour') RETURNING id",
        [A, grantId]
      )
    ).rows[0].id;
  });

  await withUser(A, async () => {
    const own = await db.query("SELECT expires_at, oauth_grant_id FROM public.api_keys WHERE id = $1", [keyId]);
    check("wlasciciel widzi swoj token OAuth jak klucz", own.rows.length === 1 && own.rows[0].oauth_grant_id === grantId);
    check(
      "ale nie przedluza mu waznosci",
      await throwsInSavepoint("UPDATE public.api_keys SET expires_at = NULL WHERE id = $1", [keyId])
    );
    check(
      "ani nie tworzy sobie klucza z cudza zgoda",
      await throwsInSavepoint(
        "INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, oauth_grant_id) VALUES ($1, 'x', 'guidon_x', 'hash073b', '{tasks:read}', $2)",
        [A, grantId]
      )
    );
  });
  await withUser(stranger, async () => {
    const seen = await db.query("SELECT id FROM public.api_keys WHERE id = $1", [keyId]);
    check("obcy nie widzi cudzego tokenu OAuth", seen.rows.length === 0);
  });

  await withServiceRole(async () => {
    await db.query("DELETE FROM public.oauth_grants WHERE id = $1", [grantId]);
    const left = await db.query("SELECT id FROM public.api_keys WHERE id = $1", [keyId]);
    check("usuniecie zgody usuwa jej tokeny (ON DELETE CASCADE)", left.rows.length === 0);
    await db.query("DELETE FROM public.oauth_clients WHERE client_id = 'gdc_test'");
  });
}

section("60. przypiete zadania (migracja 074)");

{
  await withUser(A, async () => {
    const set = await db.query("UPDATE public.profiles SET pinned_task_ids = ARRAY[gen_random_uuid()] WHERE id = $1 RETURNING pinned_task_ids", [A]);
    check("wlasciciel profilu przypina zadanie", set.rows[0]?.pinned_task_ids?.length === 1);
    check(
      "najwyzej 10 przypietych",
      await throwsInSavepoint("UPDATE public.profiles SET pinned_task_ids = (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 11)) WHERE id = $1", [A])
    );
    const ten = await db.query("UPDATE public.profiles SET pinned_task_ids = (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 10)) WHERE id = $1 RETURNING id", [A]);
    check("10 przechodzi", ten.rows.length === 1);
    const other = await db.query("UPDATE public.profiles SET pinned_task_ids = '{}' WHERE id = $1 RETURNING id", [B]);
    check("nie zmienia przypiec kogos innego", other.rows.length === 0);
    await db.query("UPDATE public.profiles SET pinned_task_ids = '{}' WHERE id = $1", [A]);
  });
}

section("61. zadania asynchroniczne API i sandbox (migracja 075)");

{
  await withUser(A, async () => {
    check("authenticated nie czyta api_jobs", await throwsInSavepoint("SELECT * FROM public.api_jobs"));
    const org = await db.query("INSERT INTO public.organizations (name, slug, is_sandbox) VALUES ('Sandbox', 'sandbox-075', true) RETURNING id, is_sandbox, created_by");
    check("uzytkownik tworzy swoja organizacje sandbox", org.rows[0]?.is_sandbox === true && org.rows[0]?.created_by === A);
    const plain = await db.query("INSERT INTO public.organizations (name, slug) VALUES ('Plain', 'plain-075') RETURNING is_sandbox");
    check("zwykla organizacja nie jest sandboxem", plain.rows[0]?.is_sandbox === false);
  });
  await withServiceRole(async () => {
    const job = await db.query("INSERT INTO public.api_jobs (user_id, kind, total) VALUES ($1, 'task_import', 3) RETURNING status, done", [A]);
    check("nowe zadanie API: queued, 0 zrobionych", job.rows[0]?.status === "queued" && job.rows[0]?.done === 0);
    check("nieznany status odrzucony", await throwsInSavepoint("INSERT INTO public.api_jobs (user_id, kind, status) VALUES ($1, 'task_import', 'paused')", [A]));
    check("nieznany rodzaj odrzucony", await throwsInSavepoint("INSERT INTO public.api_jobs (user_id, kind) VALUES ($1, 'export')", [A]));
  });
}

section("62. kolumny tozsamosci tylko do odczytu (migracja 076)");

{
  await withUser(A, async () => {
    check("nie zmienia wlasnego profiles.email", await throwsInSavepoint("UPDATE public.profiles SET email = 'Admin@Example.com' WHERE id = $1", [A]));
    check("nie zmienia wlasnego profiles.id", await throwsInSavepoint("UPDATE public.profiles SET id = gen_random_uuid() WHERE id = $1", [A]));
    const own = await db.query("UPDATE public.profiles SET full_name = 'Nowe Imie', avatar_url = NULL, locale = 'pl' WHERE id = $1 RETURNING full_name", [A]);
    check("zmienia imie, avatar i jezyk", own.rows[0]?.full_name === "Nowe Imie");
    const pins = await db.query("UPDATE public.profiles SET pinned_project_ids = '{}', pinned_task_ids = '{}' WHERE id = $1 RETURNING id", [A]);
    check("przypiecia dalej dzialaja", pins.rows.length === 1);
    const task = await db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'komentowane 076') RETURNING id", [projectId]);
    const comment = await db.query("INSERT INTO public.task_comments (task_id, author_id, content) VALUES ($1, $2, 'tresc') RETURNING id", [task.rows[0].id, A]);
    const cid = comment.rows[0].id;
    check("nie przenosi komentarza do innego zadania", await throwsInSavepoint("UPDATE public.task_comments SET task_id = gen_random_uuid() WHERE id = $1", [cid]));
    check("nie nadaje komentarzowi etykiety agenta", await throwsInSavepoint("UPDATE public.task_comments SET actor_label = 'Claude' WHERE id = $1", [cid]));
    const edited = await db.query("UPDATE public.task_comments SET content = 'poprawiona' WHERE id = $1 RETURNING content", [cid]);
    check("autor dalej poprawia tresc komentarza", edited.rows[0]?.content === "poprawiona");
  });
}

section("63. sciezka pliku nalezy do projektu wiersza (migracja 077)");

{
  await withUser(A, async () => {
    const task = await db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'zalaczniki 077') RETURNING id", [projectId]);
    const tid = task.rows[0].id;
    const foreign = "projects/00000000-0000-0000-0000-000000000000/tasks/x/secret.pdf";
    check("zalacznik ze sciezka innego projektu odrzucony", await throwsInSavepoint("INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by) VALUES ($1, 's.pdf', $2, $3)", [tid, foreign, A]));
    check("zalacznik z '..' odrzucony", await throwsInSavepoint("INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by) VALUES ($1, 's.pdf', 'projects/' || $2 || '/../x/secret.pdf', $3)", [tid, projectId, A]));
    const ok = await db.query("INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by) VALUES ($1, 'ok.pdf', 'projects/' || $2 || '/tasks/ok.pdf', $3) RETURNING id", [tid, projectId, A]);
    check("zalacznik z wlasna sciezka przechodzi", ok.rows.length === 1);
    check("plik projektu ze sciezka innego projektu odrzucony", await throwsInSavepoint("INSERT INTO public.project_files (project_id, name, storage_path, uploaded_by) VALUES ($1, 'f.txt', $2, $3)", [projectId, foreign, A]));
    check("referencja ze sciezka innego projektu odrzucona", await throwsInSavepoint("INSERT INTO public.project_references (project_id, name, storage_path, mime_type, uploaded_by) VALUES ($1, 'r.png', $2, 'image/png', $3)", [projectId, foreign, A]));
  });
}

section("64. podpisane zadania klienta OAuth (migracja 078)");
{
  const hash = "a".repeat(64);
  await withServiceRole(async () => {
    await db.query("INSERT INTO public.oauth_client_assertions (assertion_hash, expires_at) VALUES ($1, now() + interval '5 minutes')", [hash]);
    check("service_role zapisuje identyfikator podpisu", (await db.query("SELECT assertion_hash FROM public.oauth_client_assertions WHERE assertion_hash=$1", [hash])).rows.length === 1);
    check("powtorzony podpis odrzucony przez klucz glowny", await throwsInSavepoint("INSERT INTO public.oauth_client_assertions (assertion_hash, expires_at) VALUES ($1, now() + interval '5 minutes')", [hash]));
    await db.query("DELETE FROM public.oauth_client_assertions WHERE assertion_hash=$1", [hash]);
  });
  await withUser(A, async () => {
    check("uzytkownik nie zapisuje identyfikatora podpisu", await throwsInSavepoint("INSERT INTO public.oauth_client_assertions (assertion_hash, expires_at) VALUES ($1, now())", [hash]));
  });
  await withAnon(async () => {
    check("anon nie czyta podpisow", await throwsInSavepoint("SELECT * FROM public.oauth_client_assertions"));
  });
}

section("65. custom module isolation and concurrent saves (migration 079)");
{
  await withUser(A, async () => {
    const result = await db.query("UPDATE public.projects SET custom_modules = '[{\"id\":\"notes\"}]', custom_modules_revision = 1 WHERE id = $1 AND custom_modules_revision = 0 RETURNING id", [projectId]);
    check("owner saves project modules", result.rows.length === 1);
    const content = [{ version: 1, id: "notes", title: "Notes", description: "", blocks: [{ type: "text", title: "Notes", text: "Content" }] }];
    const compiled = compile({ table: "projects", op: "update", columns: ["custom_modules"], filters: [{ column: "id", op: "eq", value: projectId }], order: [], limit: null, values: [{ custom_modules: JSON.stringify(content) }] });
    const roundtrip = await db.query(compiled.text, compiled.values);
    check("compiled self-hosted JSONB module update round-trips", isDeepStrictEqual(roundtrip.rows[0]?.custom_modules, content));
    const stale = await db.query("UPDATE public.projects SET custom_modules_revision = 2 WHERE id = $1 AND custom_modules_revision = 0 RETURNING id", [projectId]);
    check("stale module revision cannot overwrite newer content", stale.rows.length === 0);
    check("module value must be an array", await throwsInSavepoint("UPDATE public.projects SET custom_modules = '{}' WHERE id = $1", [projectId]));
    check("module count is bounded", await throwsInSavepoint("UPDATE public.projects SET custom_modules = (SELECT jsonb_agg(i) FROM generate_series(1,21) i) WHERE id = $1", [projectId]));
  });
  await withUser(B, async () => {
    const result = await db.query("UPDATE public.projects SET custom_modules = '[]' WHERE id = $1 RETURNING id", [projectId]);
    check("another tenant cannot overwrite custom modules", result.rows.length === 0);
  });
  await withServiceRole(async () => {
    await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'developer')", [projectId, B]);
  });
  await withUser(B, async () => {
    const read = await db.query("SELECT custom_modules FROM public.projects WHERE id = $1", [projectId]);
    check("project developer can read custom modules", read.rows[0]?.custom_modules.length === 1);
    const write = await db.query("UPDATE public.projects SET custom_modules = '[]' WHERE id = $1 RETURNING id", [projectId]);
    check("project developer cannot change custom modules", write.rows.length === 0);
  });
}

section("66. declarative module packages: tenant/role boundaries and atomic revisions (080)");
{
  const manifest = await readFile(path.join(DB_DIR, "..", "..", "examples", "module-manifests", "release-planning.json"), "utf8");
  const records = await readFile(path.join(DB_DIR, "..", "..", "examples", "module-manifests", "release-planning-data.json"), "utf8");
  await withServiceRole(async () => {
    await db.query("DELETE FROM public.project_members WHERE project_id = $1 AND user_id = $2", [projectId, B]);
  });
  await withUser(A, async () => {
    const statement = compile({ table: "project_module_packages", op: "insert", columns: ["module_id", "records"], filters: [], order: [], limit: null, values: [{ project_id: projectId, module_id: "release-planning", manifest, records }] });
    const result = await db.query(statement.text, statement.values);
    check("owner installs manifest and fixture records atomically", result.rows[0]?.records.length === 2);
    check("package is readable from its owning project", (await db.query("SELECT module_id FROM public.project_module_packages WHERE project_id=$1", [projectId])).rows.length === 1);
    check("a duplicate installation is rejected", await throwsInSavepoint("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,'release-planning',$2)", [projectId, manifest]));
    const saved = await db.query("UPDATE public.project_module_packages SET records='[]', revision=1 WHERE project_id=$1 AND module_id='release-planning' AND revision=0 RETURNING revision", [projectId]);
    check("owner updates data with a matching revision", saved.rows[0]?.revision === 1);
    check("stale revision cannot overwrite data", (await db.query("UPDATE public.project_module_packages SET revision=2 WHERE project_id=$1 AND revision=0 RETURNING module_id", [projectId])).rows.length === 0);
    check("package identity cannot be moved to a different project", await throwsInSavepoint("UPDATE public.project_module_packages SET project_id=$2 WHERE project_id=$1", [projectId, otherProjectId]));
    check("module data cannot be a JSON object", await throwsInSavepoint("UPDATE public.project_module_packages SET records='{}' WHERE project_id=$1", [projectId]));
    check("module record count is bounded", await throwsInSavepoint("UPDATE public.project_module_packages SET records=(SELECT jsonb_agg(i) FROM generate_series(1,1001) i) WHERE project_id=$1", [projectId]));
    check("manifest identity mismatch rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET manifest='{\"manifestVersion\":1,\"id\":\"other\"}' WHERE project_id=$1", [projectId]));
    check("manifest without identity rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET manifest='{}' WHERE project_id=$1", [projectId]));
    check("uninstall cannot silently delete module data", await throwsInSavepoint("DELETE FROM public.project_module_packages WHERE project_id=$1", [projectId]));
    for (let i=0; i<19; i++) {
      await db.query("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,$2,$3)", [projectId, `extra-${i}`, JSON.stringify({ manifestVersion: 1, id: `extra-${i}` })]);
    }
    check("project package cap rejects the 21st module", await throwsInSavepoint("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,'too-many','{\"manifestVersion\":1,\"id\":\"too-many\"}')", [projectId]));
  });
  await withUser(B, async () => {
    check("different tenant cannot read module records", (await db.query("SELECT records FROM public.project_module_packages WHERE project_id=$1", [projectId])).rows.length === 0);
    check("different tenant cannot overwrite module records", (await db.query("UPDATE public.project_module_packages SET records='[]' WHERE project_id=$1 RETURNING module_id", [projectId])).rows.length === 0);
    check("different tenant cannot install a package", await throwsInSavepoint("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,'intruder','{\"manifestVersion\":1,\"id\":\"intruder\"}')", [projectId]));
  });
  await withServiceRole(async () => { await db.query("INSERT INTO public.project_members (project_id,user_id,role) VALUES ($1,$2,'developer')", [projectId, B]); });
  await withUser(B, async () => {
    check("project developer can read installed module data", (await db.query("SELECT module_id FROM public.project_module_packages WHERE project_id=$1", [projectId])).rows.length === 20);
    check("project developer cannot change records or disable a module", (await db.query("UPDATE public.project_module_packages SET records='[]',enabled=false WHERE project_id=$1 RETURNING module_id", [projectId])).rows.length === 0);
    check("read permission does not grant module installation", await throwsInSavepoint("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,'reader-install','{\"manifestVersion\":1,\"id\":\"reader-install\"}')", [projectId]));
  });
  await withAnon(async () => { check("anonymous users cannot read module packages", await throwsInSavepoint("SELECT records FROM public.project_module_packages")); });
  await withServiceRole(async () => { await db.query("UPDATE public.project_members SET role='admin' WHERE project_id=$1 AND user_id=$2", [projectId,B]); });
  await withUser(B, async () => {
    check("project admin can save package data", (await db.query("UPDATE public.project_module_packages SET revision=2 WHERE project_id=$1 AND module_id='release-planning' RETURNING revision", [projectId])).rows[0]?.revision === 2);
  });
  await withServiceRole(async () => { await db.query("DELETE FROM public.project_members WHERE project_id=$1 AND user_id=$2", [projectId,B]); });
  await withUser(B, async () => {
    check("revoked membership immediately loses module access", (await db.query("SELECT records FROM public.project_module_packages WHERE project_id=$1", [projectId])).rows.length === 0);
  });
}

section("67. module registry visibility and publishing authority (081)");
{
  await withServiceRole(async () => {
    await db.query("DELETE FROM public.organization_members WHERE organization_id=$1 AND user_id=$2", [orgId,B]);
    for (const [id, org, published] of [["org-module", orgId, true], ["draft-module", null, false]]) {
      await db.query("INSERT INTO public.module_listings(module_id,organization_id) VALUES ($1,$2)", [id,org]);
      await db.query("INSERT INTO public.module_catalog_entries(module_id,version,organization_id,category,description,manifest,published,status,visibility) VALUES ($1,'1.0.0',$2,'research','Test listing',$3,$4,$5,$6)",
        [id,org,JSON.stringify({ manifestVersion: 1, id, version: "1.0.0" }),published,published ? "published" : "pending_review",org ? "organization" : "public"]);
    }
  });
  await withUser(A, async () => {
    const seeded = (await db.query("SELECT manifest,demo_records FROM public.module_catalog_entries WHERE module_id='release-planning'")).rows[0];
    const validated = moduleManifestSchema.parse(seeded.manifest);
    check("signed-in user sees the real seeded catalog release", validated.views.length === 5);
    check("seeded catalog manifest and fixtures pass runtime validation", parseModuleRecords(validated, seeded.demo_records).length === 1);
    check("org member sees published organization listings", (await db.query("SELECT module_id FROM public.module_catalog_entries WHERE module_id='org-module'")).rows.length === 1);
    check("draft listings stay hidden from regular readers", (await db.query("SELECT module_id FROM public.module_catalog_entries WHERE module_id='draft-module'")).rows.length === 0);
    check("a user cannot publish their own module through the Data API", await throwsInSavepoint("UPDATE public.module_catalog_entries SET published=true WHERE module_id='draft-module'"));
    check("a user cannot overwrite a catalog release", await throwsInSavepoint("UPDATE public.module_catalog_entries SET manifest='{}' WHERE module_id='release-planning'"));
    check("a user cannot remove a catalog release", await throwsInSavepoint("DELETE FROM public.module_catalog_entries WHERE module_id='release-planning'"));
  });
  await withUser(B, async () => {
    check("another org cannot see a private catalog listing", (await db.query("SELECT module_id FROM public.module_catalog_entries WHERE module_id='org-module'")).rows.length === 0);
    check("published global catalog entries are shared with signed-in users", (await db.query("SELECT module_id FROM public.module_catalog_entries WHERE module_id='release-planning'")).rows.length === 1);
  });
  await withAnon(async () => { check("catalog does not expose private listings anonymously", await throwsInSavepoint("SELECT manifest FROM public.module_catalog_entries")); });
}

section("68. catalog installation orchestration against real RLS");
{
  const storeFor = (actor) => ({
    getProject: (id) => withUser(actor, async () => {
      const row = (await db.query("SELECT organization_id,private.project_role(id) role FROM public.projects WHERE id=$1", [id])).rows[0];
      return row ? { organizationId: row.organization_id, canManage: ["owner","admin"].includes(row.role) } : null;
    }),
    getEntry: (id,version) => withUser(actor, async () => {
      const row = (await db.query("SELECT manifest,organization_id FROM public.module_catalog_entries WHERE module_id=$1 AND version=$2", [id,version])).rows[0];
      if (!row) return null;
      const manifest = moduleManifestSchema.parse(row.manifest);
      return { manifest, organizationId: row.organization_id, compatible: true, digest: createHash("sha256").update(JSON.stringify(manifest)).digest("hex") };
    }),
    getExisting: (id,name) => withUser(actor, async () => {
      const row = (await db.query("SELECT manifest FROM public.project_module_packages WHERE project_id=$1 AND module_id=$2", [id,name])).rows[0];
      return row ? { manifest: moduleManifestSchema.parse(row.manifest) } : null;
    }),
    async insert(id,manifest) {
      try {
        await withUser(actor, () => db.query("INSERT INTO public.project_module_packages(project_id,module_id,manifest) VALUES($1,$2,$3)", [id,manifest.id,JSON.stringify(manifest)]));
        return "created";
      } catch(error) { return error.code === "23505" ? "duplicate" : error.code === "23514" ? "limit" : "failed"; }
    },
  });
  const store = storeFor(A);
  const entry = await store.getEntry("release-planning","1.0.0");
  const request = { projectId: otherProjectId, moduleId: "release-planning", version: "1.0.0", permissions: entry.manifest.permissions, expectedDigest: entry.digest };
  check("catalog installer creates a project-owned package", (await installCatalogModule(request,store)).error === null);
  await withUser(A, async () => {
    const row = (await db.query("SELECT records FROM public.project_module_packages WHERE project_id=$1 AND module_id='release-planning'", [otherProjectId])).rows[0];
    check("installation does not copy preview fixture data", row.records.length === 0);
    await db.query("UPDATE public.project_module_packages SET records=$2,revision=1 WHERE project_id=$1 AND module_id='release-planning'", [otherProjectId,JSON.stringify([{ id:"10000000-0000-4000-8000-000000000003",entity:"release",values:{name:"User data",status:"planned"}}])]);
  });
  check("repeated installation returns the same package", (await installCatalogModule(request,store)).existing === true);
  check("missing consent rejects installation", (await installCatalogModule({ ...request,permissions:[] },store)).error === "consent");
  check("changed artifact digest requires a fresh review", (await installCatalogModule({ ...request,expectedDigest:"old-artifact" },store)).error === "conflict");
  check("foreign tenant cannot install into this project", (await installCatalogModule(request,storeFor(B))).error === "permission");
  await withUser(A, async () => {
    const rows = (await db.query("SELECT records,revision FROM public.project_module_packages WHERE project_id=$1 AND module_id='release-planning'", [otherProjectId])).rows;
    check("retry/failed attempts preserve the only installation and edited records", rows.length === 1 && rows[0].revision === 1 && rows[0].records[0].values.name === "User data");
  });
}

section("69. module lifecycle retains data, gates roles and protects revisions (082)");
{
  const name = "release-planning";
  await withUser(A,async () => {
    await db.query("UPDATE public.project_module_packages SET enabled=false,revision=2 WHERE project_id=$1 AND module_id=$2 AND revision=1",[otherProjectId,name]);
    await db.query("UPDATE public.project_module_packages SET installed=false,enabled=false,revision=3 WHERE project_id=$1 AND module_id=$2 AND revision=2",[otherProjectId,name]);
    const row=(await db.query("SELECT installed,records,revision FROM public.project_module_packages WHERE project_id=$1 AND module_id=$2",[otherProjectId,name])).rows[0];
    check("uninstall archives a package without changing its edited records",!row.installed && row.records[0].values.name==="User data");
    check("an archived package cannot remain enabled",await throwsInSavepoint("UPDATE public.project_module_packages SET enabled=true WHERE project_id=$1 AND module_id=$2",[otherProjectId,name]));
    check("uninstall does not grant deletion",await throwsInSavepoint("DELETE FROM public.project_module_packages WHERE project_id=$1",[otherProjectId]));
    check("stale data save cannot overwrite an archived revision",(await db.query("UPDATE public.project_module_packages SET records='[]' WHERE project_id=$1 AND revision=1 RETURNING module_id",[otherProjectId])).rows.length===0);
    await db.query("UPDATE public.project_module_packages SET installed=true,enabled=true,revision=4 WHERE project_id=$1 AND module_id=$2 AND revision=3",[otherProjectId,name]);
    check("restore retains the same records",(await db.query("SELECT records FROM public.project_module_packages WHERE project_id=$1 AND module_id=$2",[otherProjectId,name])).rows[0].records[0].values.name==="User data");
    await db.query("UPDATE public.project_module_packages SET settings='{\"defaultView\":\"releases\"}',revision=5 WHERE project_id=$1 AND module_id=$2",[otherProjectId,name]);
    check("unknown settings cannot become executable configuration",await throwsInSavepoint("UPDATE public.project_module_packages SET settings='{\"script\":\"evil\"}' WHERE project_id=$1",[otherProjectId]));
    check("settings must be an object",await throwsInSavepoint("UPDATE public.project_module_packages SET settings='[]' WHERE project_id=$1",[otherProjectId]));
    const old=(await db.query("SELECT manifest,records FROM public.project_module_packages WHERE project_id=$1 AND module_id=$2",[otherProjectId,name])).rows[0];
    const next=moduleManifestSchema.parse({...old.manifest,version:"1.1.0"});
    parseModuleRecords(next,old.records);
    await db.query("UPDATE public.project_module_packages SET manifest=$3,revision=6 WHERE project_id=$1 AND module_id=$2 AND revision=5",[otherProjectId,name,JSON.stringify(next)]);
    parseModuleRecords(moduleManifestSchema.parse(old.manifest),old.records);
    await db.query("UPDATE public.project_module_packages SET manifest=$3,revision=7 WHERE project_id=$1 AND module_id=$2 AND revision=6",[otherProjectId,name,JSON.stringify(old.manifest)]);
    const after=(await db.query("SELECT manifest,records FROM public.project_module_packages WHERE project_id=$1 AND module_id=$2",[otherProjectId,name])).rows[0];
    check("version update and compatible rollback preserve data",after.manifest.version===old.manifest.version && isDeepStrictEqual(after.records,old.records));
  });
  await withServiceRole(async()=>{await db.query("INSERT INTO public.project_members(project_id,user_id,role) VALUES($1,$2,'developer') ON CONFLICT DO NOTHING",[otherProjectId,B]);});
  await withUser(B,async()=>{
    check("readers cannot restore, disable or configure modules",(await db.query("UPDATE public.project_module_packages SET installed=false,enabled=false,settings='{}' WHERE project_id=$1 RETURNING module_id",[otherProjectId])).rows.length===0);
  });
}

section("70. personal module drafts: tenant/role boundaries and optimistic writes (083)");
{
  const state={version:1,past:[],present:{prompt:"private prompt",plan:null,manifest:null},future:[]};
  await withUser(A,async()=>{
    await db.query("INSERT INTO public.project_module_drafts(project_id,user_id,state) VALUES($1,$2,$3)",[otherProjectId,A,JSON.stringify(state)]);
    check("manager can load their draft after saving",(await db.query("SELECT state FROM public.project_module_drafts WHERE project_id=$1",[otherProjectId])).rows[0].state.present.prompt==="private prompt");
    check("draft revision-guarded save succeeds once",(await db.query("UPDATE public.project_module_drafts SET revision=2 WHERE project_id=$1 AND user_id=$2 AND revision=1 RETURNING revision",[otherProjectId,A])).rows.length===1);
    check("stale draft cannot overwrite a newer save",(await db.query("UPDATE public.project_module_drafts SET state=$3 WHERE project_id=$1 AND user_id=$2 AND revision=1 RETURNING revision",[otherProjectId,A,JSON.stringify({...state,present:{prompt:"stale",plan:null,manifest:null}})])).rows.length===0);
    check("cannot create another user's draft",await throwsInSavepoint("INSERT INTO public.project_module_drafts(project_id,user_id,state) VALUES($1,$2,$3)",[otherProjectId,B,JSON.stringify(state)]));
    check("draft identity columns are immutable",await throwsInSavepoint("UPDATE public.project_module_drafts SET user_id=$2 WHERE project_id=$1",[otherProjectId,B]));
    check("draft requires the bounded history shape",await throwsInSavepoint("UPDATE public.project_module_drafts SET state='{}' WHERE project_id=$1",[otherProjectId]));
  });
  await withUser(B,async()=>{
    check("project reader cannot see a manager's personal draft",(await db.query("SELECT 1 FROM public.project_module_drafts WHERE project_id=$1",[otherProjectId])).rows.length===0);
    check("project reader cannot create drafts",await throwsInSavepoint("INSERT INTO public.project_module_drafts(project_id,user_id,state) VALUES($1,$2,$3)",[otherProjectId,B,JSON.stringify(state)]));
  });
  await withServiceRole(async()=>{await db.query("UPDATE public.project_members SET role='admin' WHERE project_id=$1 AND user_id=$2",[otherProjectId,B]);});
  await withUser(B,async()=>{
    check("another admin still cannot read personal prompt/history",(await db.query("SELECT 1 FROM public.project_module_drafts WHERE project_id=$1",[otherProjectId])).rows.length===0);
    await db.query("INSERT INTO public.project_module_drafts(project_id,user_id,state) VALUES($1,$2,$3)",[otherProjectId,B,JSON.stringify(state)]);
    check("admins keep separate drafts in the same project",(await db.query("SELECT user_id FROM public.project_module_drafts WHERE project_id=$1",[otherProjectId])).rows[0].user_id===B);
  });
  await withServiceRole(async()=>{await db.query("DELETE FROM public.project_members WHERE project_id=$1 AND user_id=$2",[otherProjectId,B]);});
  await withUser(B,async()=>{
    check("revoked membership immediately hides their saved draft",(await db.query("SELECT 1 FROM public.project_module_drafts WHERE project_id=$1",[otherProjectId])).rows.length===0);
    check("revoked membership cannot update its old draft",(await db.query("UPDATE public.project_module_drafts SET revision=2 WHERE project_id=$1 AND user_id=$2 RETURNING user_id",[otherProjectId,B])).rows.length===0);
  });
  let anonDenied=false;try{await withAnon(()=>db.query("SELECT 1 FROM public.project_module_drafts"));}catch{anonDenied=true;}check("anonymous clients cannot access drafts",anonDenied);
}

section("71. module cap counts installed packages only, reinstall included (087)");

{
  await withUser(A, async () => {
    const proj = await db.query("INSERT INTO public.projects (organization_id, name) SELECT organization_id, 'Modules 087' FROM public.projects WHERE id = $1 RETURNING id", [projectId]);
    const pid = proj.rows[0].id;
    const install = (id) => db.query("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,$2,$3)", [pid, id, JSON.stringify({ manifestVersion: 1, id })]);
    for (let i = 0; i < 20; i++) await install(`m-${i}`);
    check("21st installed module still rejected", await throwsInSavepoint("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,'m-20','{\"manifestVersion\":1,\"id\":\"m-20\"}')", [pid]));
    await db.query("UPDATE public.project_module_packages SET installed = false, enabled = false WHERE project_id = $1 AND module_id = 'm-0'", [pid]);
    await install("m-20");
    check("after uninstalling one, a new module can be installed", (await db.query("SELECT 1 FROM public.project_module_packages WHERE project_id=$1 AND module_id='m-20' AND installed", [pid])).rows.length === 1);
    check("reinstalling an archived module over the cap is rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET installed = true WHERE project_id = $1 AND module_id = 'm-0'", [pid]));
    await db.query("UPDATE public.project_module_packages SET installed = false, enabled = false WHERE project_id = $1 AND module_id = 'm-5'", [pid]);
    const back = await db.query("UPDATE public.project_module_packages SET installed = true WHERE project_id = $1 AND module_id = 'm-0' RETURNING module_id", [pid]);
    check("reinstalling an archived module under the cap works", back.rows.length === 1);
    const settings = await db.query("UPDATE public.project_module_packages SET settings = '{}' WHERE project_id = $1 AND module_id = 'm-1' RETURNING module_id", [pid]);
    check("other updates of an installed module are not capped", settings.rows.length === 1);
  });
}

section("72. module category in package settings (088)");

{
  await withUser(A, async () => {
    const proj = await db.query("INSERT INTO public.projects (organization_id, name) SELECT organization_id, 'Modules 088' FROM public.projects WHERE id = $1 RETURNING id", [projectId]);
    const pid = proj.rows[0].id;
    await db.query("INSERT INTO public.project_module_packages (project_id,module_id,manifest) VALUES ($1,'cat-mod','{\"manifestVersion\":1,\"id\":\"cat-mod\"}')", [pid]);
    const set = (settings) => db.query("UPDATE public.project_module_packages SET settings = $2 WHERE project_id = $1 AND module_id = 'cat-mod' RETURNING settings", [pid, JSON.stringify(settings)]);
    check("category is accepted", (await set({ category: "Marketing" })).rows[0]?.settings?.category === "Marketing");
    check("category with default view is accepted", (await set({ category: "Ops", defaultView: "table-view" })).rows.length === 1);
    check("empty category rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET settings = '{\"category\":\"\"}' WHERE project_id = $1", [pid]));
    check("category over 40 characters rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET settings = $2 WHERE project_id = $1", [pid, JSON.stringify({ category: "x".repeat(41) })]));
    check("category with surrounding spaces rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET settings = '{\"category\":\" Ops\"}' WHERE project_id = $1", [pid]));
    check("non-string category rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET settings = '{\"category\":5}' WHERE project_id = $1", [pid]));
    check("unknown settings keys still rejected", await throwsInSavepoint("UPDATE public.project_module_packages SET settings = '{\"color\":\"red\"}' WHERE project_id = $1", [pid]));
  });
}

section("73. webhook delivery queue (089)");

{
  let hook;
  await withUser(A, async () => {
    hook = (await db.query(insertWebhookSql, [orgId, ["task.created"], A])).rows[0].id;
  });
  let deliveryId;
  await withServiceRole(async () => {
    const row = await db.query(
      "INSERT INTO public.organization_webhook_deliveries (webhook_id, organization_id, event_type, payload, next_attempt_at) VALUES ($1, $2, 'task.created', '{\"data\":{}}', now()) RETURNING id, status, attempts",
      [hook, orgId]
    );
    deliveryId = row.rows[0].id;
    check("service role queues a delivery: pending, 0 attempts", row.rows[0].status === "pending" && row.rows[0].attempts === 0);
    check("pending needs a next attempt time", await throwsInSavepoint("INSERT INTO public.organization_webhook_deliveries (webhook_id, organization_id, event_type, payload) VALUES ($1, $2, 'task.created', '{}')", [hook, orgId]));
    check("unknown event type rejected", await throwsInSavepoint("INSERT INTO public.organization_webhook_deliveries (webhook_id, organization_id, event_type, payload, next_attempt_at) VALUES ($1, $2, 'task.exploded', '{}', now())", [hook, orgId]));
    check("unknown status rejected", await throwsInSavepoint("UPDATE public.organization_webhook_deliveries SET status = 'lost' WHERE id = $1", [deliveryId]));
    const done = await db.query("UPDATE public.organization_webhook_deliveries SET status = 'succeeded', attempts = 1, next_attempt_at = NULL, last_status = 200 WHERE id = $1 RETURNING status", [deliveryId]);
    check("service role records the outcome", done.rows[0]?.status === "succeeded");
  });
  await withUser(A, async () => {
    check("org owner reads the delivery history", (await db.query("SELECT id FROM public.organization_webhook_deliveries WHERE webhook_id = $1", [hook])).rows.length === 1);
    check("owner cannot write deliveries", await throwsInSavepoint("UPDATE public.organization_webhook_deliveries SET status = 'pending', next_attempt_at = now() WHERE id = $1", [deliveryId]));
    check("owner cannot insert deliveries", await throwsInSavepoint("INSERT INTO public.organization_webhook_deliveries (webhook_id, organization_id, event_type, payload, next_attempt_at) VALUES ($1, $2, 'task.created', '{}', now())", [hook, orgId]));
  });
  await withUser(D, async () => {
    check("plain org member does not see deliveries", (await db.query("SELECT id FROM public.organization_webhook_deliveries WHERE webhook_id = $1", [hook])).rows.length === 0);
  });
  await withUser(B, async () => {
    check("other tenant does not see deliveries", (await db.query("SELECT id FROM public.organization_webhook_deliveries WHERE webhook_id = $1", [hook])).rows.length === 0);
  });
  let anonDenied = false;
  try { await withAnon(() => db.query("SELECT 1 FROM public.organization_webhook_deliveries")); } catch { anonDenied = true; }
  check("anonymous clients cannot read deliveries", anonDenied);
  await withUser(A, async () => {
    await db.query("DELETE FROM public.organization_webhooks WHERE id = $1", [hook]);
  });
  await withServiceRole(async () => {
    check("deleting the webhook deletes its deliveries", (await db.query("SELECT 1 FROM public.organization_webhook_deliveries WHERE id = $1", [deliveryId])).rows.length === 0);
  });
}

section("74. context events: capture, dedupe, replay, isolation (090)");

{
  let eventsProject;
  let task;
  await withUser(A, async () => {
    eventsProject = (await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1, 'Events') RETURNING id", [orgId])).rows[0].id;
    task = (await db.query("INSERT INTO public.tasks (project_id, title, description) VALUES ($1, 'Secret plan', 'token=abc123') RETURNING id", [eventsProject])).rows[0].id;
    const sameTx = await db.query("SELECT seq FROM public.list_context_events($1, 0, 100)", [eventsProject]);
    check("events of a still-running transaction are not listed yet", sameTx.rows.length === 0, sameTx.rows.length);
  });
  const events = async (who = A, after = 0) =>
    withUser(who, async () => (await db.query("SELECT * FROM public.list_context_events($1, $2, 500)", [eventsProject, after])).rows);

  let rows = await events();
  const created = rows.find((e) => e.event_type === "task.created" && e.entity_id === task);
  check("task insert emits task.created with tenant ids derived from the row",
    !!created && created.organization_id === orgId && created.project_id === eventsProject && created.actor_id === A && created.source === "guidon");
  check("payload carries references only - no title or description", !JSON.stringify(created?.payload ?? {}).match(/Secret plan|abc123/));

  await withUser(A, async () => {
    await db.query("UPDATE public.tasks SET sort_order = 42 WHERE id = $1", [task]);
    await db.query("UPDATE public.tasks SET status = 'in_progress' WHERE id = $1", [task]);
    await db.query("UPDATE public.tasks SET title = 'Renamed' WHERE id = $1", [task]);
  });
  rows = await events();
  const taskEvents = rows.filter((e) => e.entity_id === task).map((e) => e.event_type);
  check("reorder only is not an event; status and edits are", JSON.stringify(taskEvents) === JSON.stringify(["task.created", "task.status_changed", "task.updated"]), taskEvents.join(","));
  const status = rows.find((e) => e.event_type === "task.status_changed");
  check("status change records from/to and the changed fields", status?.payload.from === "todo" && status?.payload.to === "in_progress" && status?.payload.fields.includes("status"), JSON.stringify(status?.payload));
  check("an edit lists field names, not values", JSON.stringify(rows.at(-1).payload) === JSON.stringify({ fields: ["title"] }), JSON.stringify(rows.at(-1).payload));
  check("seq increases in order", rows.every((e, i) => i === 0 || BigInt(e.seq) > BigInt(rows[i - 1].seq)));

  // Rolled-back work leaves no event (same transaction as the change).
  try {
    await withUser(A, async () => {
      await db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Rolled back')", [eventsProject]);
      throw new Error("abort");
    });
  } catch { /* expected */ }
  check("a rolled-back write leaves no event", (await events()).length === rows.length);

  // Comments, decisions, sources, attempts.
  let commentId;
  await withUser(A, async () => {
    commentId = (await db.query("INSERT INTO public.task_comments (task_id, author_id, content) VALUES ($1, $2, 'hello') RETURNING id", [task, A])).rows[0].id;
    await db.query("UPDATE public.task_comments SET content = 'edited' WHERE id = $1", [commentId]);
    await db.query("INSERT INTO public.context_decisions (project_id, title, made_by) VALUES ($1, 'Use Postgres', $2)", [eventsProject, A]);
    await db.query("INSERT INTO public.context_sources (project_id, source_type, title, content) VALUES ($1, 'document', 'Spec', 'body')", [eventsProject]);
    await db.query("INSERT INTO public.task_attempts (task_id, problem, approach, outcome, agent, created_by) VALUES ($1, 'p', 'a', 'failed', 'claude', $2)", [task, A]);
  });
  rows = await events();
  const types = rows.map((e) => e.event_type);
  for (const type of ["comment.created", "comment.updated", "decision.created", "source.created", "attempt.recorded"]) {
    check(`${type} captured`, types.includes(type), types.join(","));
  }
  const attempt = rows.find((e) => e.event_type === "attempt.recorded");
  check("agent runs are source=agent with outcome", attempt?.source === "agent" && attempt?.payload.outcome === "failed" && attempt?.payload.task_id === task);

  // GitHub redelivery: the webhook deletes its row after a failure, the
  // retry inserts it again - still one event.
  await withUser(A, async () => {
    await db.query("INSERT INTO public.github_task_events (task_id, event_key) VALUES ($1, 'pr:7:closed')", [task]);
  });
  await withServiceRole(async () => {
    await db.query("DELETE FROM public.github_task_events WHERE task_id = $1 AND event_key = 'pr:7:closed'", [task]);
  });
  await withUser(A, async () => {
    await db.query("INSERT INTO public.github_task_events (task_id, event_key) VALUES ($1, 'pr:7:closed')", [task]);
  });
  rows = await events();
  const github = rows.filter((e) => e.source === "github");
  check("redelivered GitHub event is recorded once", github.length === 1 && github[0].event_type === "github.pull_request", github.length);

  // Replay: reading after a cursor returns exactly the rest, and the dedupe
  // key stops a second insert of the same event.
  const middle = rows[2].seq;
  const tail = await events(A, middle);
  check("replay from a cursor returns only later events", tail.length === rows.length - 3 && tail[0].seq === rows[3].seq, `${tail.length}/${rows.length}`);
  await withServiceRole(async () => {
    const again = await db.query(
      `INSERT INTO public.context_events (organization_id, project_id, source, entity_type, entity_id, event_type, occurred_at, dedupe_key)
       VALUES ($1, $2, 'guidon', 'task', $3, 'task.created', now(), $4) ON CONFLICT (organization_id, dedupe_key) DO NOTHING RETURNING id`,
      [orgId, eventsProject, task, `task:${task}:created`]
    );
    check("same dedupe key is not stored twice", again.rows.length === 0);
  });

  // Audit log: members read, nobody but the service role writes.
  await withUser(A, async () => {
    check("owner cannot edit events", await throwsInSavepoint("UPDATE public.context_events SET event_type = 'task.updated' WHERE project_id = $1", [eventsProject]));
    check("owner cannot delete events", await throwsInSavepoint("DELETE FROM public.context_events WHERE project_id = $1", [eventsProject]));
    check("owner cannot insert events", await throwsInSavepoint(
      "INSERT INTO public.context_events (organization_id, project_id, source, entity_type, entity_id, event_type, occurred_at, dedupe_key) VALUES ($1, $2, 'guidon', 'task', $3, 'task.created', now(), 'forged')",
      [orgId, eventsProject, task]));
  });
  check("other tenant sees no events", (await events(B)).length === 0);
  await withUser(B, async () => {
    check("other tenant reads nothing from the table either", (await db.query("SELECT 1 FROM public.context_events WHERE project_id = $1", [eventsProject])).rows.length === 0);
  });
  let anonDenied = false;
  try { await withAnon(() => db.query("SELECT 1 FROM public.context_events")); } catch { anonDenied = true; }
  check("anonymous clients cannot read events", anonDenied);

  // Deleting a task logs task.deleted but not the comments it cascades to;
  // deleting the project cascades its events away without errors.
  await withUser(A, async () => {
    await db.query("DELETE FROM public.tasks WHERE id = $1", [task]);
  });
  rows = await events();
  check("task deletion is logged once, cascaded comments are not", rows.filter((e) => e.event_type === "task.deleted").length === 1 && !rows.some((e) => e.event_type === "comment.deleted"));
  await withUser(A, async () => {
    await db.query("DELETE FROM public.projects WHERE id = $1", [eventsProject]);
  });
  await withServiceRole(async () => {
    check("deleting the project deletes its events", (await db.query("SELECT 1 FROM public.context_events WHERE project_id = $1", [eventsProject])).rows.length === 0);
  });
}

section("75. organization invitations by link (091)");

{
  const E = "55555555-5555-5555-5555-555555555555";
  const F = "66666666-6666-6666-6666-666666666666";
  for (const [id, email] of [[E, "invitee@example.com"], [F, "someone-else@example.com"]]) {
    await db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)", [id, email, JSON.stringify({ full_name: email })]);
  }
  const token = "a".repeat(43);
  const hash = createHash("sha256").update(token).digest("hex");
  const insertInvite = `INSERT INTO public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
    VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id`;
  let inviteRow;
  await withUser(A, async () => {
    inviteRow = (await db.query(insertInvite, [orgId, "Invitee@Example.com", "member", hash, A])).rows[0].id;
    check("owner creates an invitation (hash only)", !!inviteRow);
    check("a second pending invitation for the same address is refused",
      await throwsInSavepoint(insertInvite, [orgId, "invitee@example.com", "admin", createHash("sha256").update("other").digest("hex"), A]));
    check("a plain token instead of a hash is refused",
      await throwsInSavepoint(insertInvite, [orgId, "x@example.com", "member", "plain-token", A]));
    check("owner lists the organization's invitations", (await db.query("SELECT id FROM public.invitations WHERE organization_id = $1", [orgId])).rows.length >= 1);
    check("nobody can edit an invitation (no UPDATE grant)", await throwsInSavepoint("UPDATE public.invitations SET role = 'owner' WHERE id = $1", [inviteRow]));
  });
  await withUser(D, async () => {
    check("plain member cannot invite", await throwsInSavepoint(insertInvite, [orgId, "y@example.com", "member", createHash("sha256").update("y").digest("hex"), D]));
    check("plain member does not see invitations", (await db.query("SELECT id FROM public.invitations WHERE id = $1", [inviteRow])).rows.length === 0);
  });
  await withUser(B, async () => {
    check("other tenant does not see invitations", (await db.query("SELECT id FROM public.invitations WHERE id = $1", [inviteRow])).rows.length === 0);
    const preview = await db.query("SELECT * FROM public.invitation_preview($1)", ["wrong-token"]);
    check("unknown token previews nothing", preview.rows.length === 0);
  });

  await withUser(F, async () => {
    const preview = (await db.query("SELECT * FROM public.invitation_preview($1)", [token])).rows[0];
    check("the link holder sees what the invitation is for", preview?.status === "pending" && preview?.organization_id === orgId && preview?.role === "member" && !!preview?.target_name, JSON.stringify(preview));
    const result = (await db.query("SELECT * FROM public.accept_invitation($1)", [token])).rows[0];
    check("a forwarded link does not work for another address", result.result === "email_mismatch", result.result);
    check("…and adds no membership", (await db.query("SELECT 1 FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgId, F])).rows.length === 0);
  });
  let anonDenied = false;
  try { await withAnon(() => db.query("SELECT * FROM public.accept_invitation($1)", [token])); } catch { anonDenied = true; }
  check("anonymous callers cannot accept", anonDenied);

  await withUser(E, async () => {
    const result = (await db.query("SELECT * FROM public.accept_invitation($1)", [token])).rows[0];
    check("the invited address accepts (email compared case-insensitively)", result.result === "accepted" && result.organization_id === orgId, JSON.stringify(result));
    const role = (await db.query("SELECT role FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgId, E])).rows[0]?.role;
    check("membership created with the invited role", role === "member", role);
    const again = (await db.query("SELECT * FROM public.accept_invitation($1)", [token])).rows[0];
    check("the link works only once", again.result === "used", again.result);
  });
  await withServiceRole(async () => {
    const row = (await db.query("SELECT status, accepted_at FROM public.invitations WHERE id = $1", [inviteRow])).rows[0];
    check("invitation marked accepted", row.status === "accepted" && row.accepted_at !== null, JSON.stringify(row));
  });

  // Expired link.
  const expiredToken = "b".repeat(43);
  let expiredId;
  await withUser(A, async () => {
    expiredId = (await db.query(insertInvite, [orgId, "someone-else@example.com", "admin", createHash("sha256").update(expiredToken).digest("hex"), A])).rows[0].id;
  });
  await withServiceRole(() => db.query("UPDATE public.invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [expiredId]));
  await withUser(F, async () => {
    check("expired link previews as expired", (await db.query("SELECT status FROM public.invitation_preview($1)", [expiredToken])).rows[0]?.status === "expired");
    check("expired link cannot be accepted", (await db.query("SELECT result FROM public.accept_invitation($1)", [expiredToken])).rows[0].result === "expired");
    check("…and adds no membership", (await db.query("SELECT 1 FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgId, F])).rows.length === 0);
  });

  // An admin may not invite an owner (001 policy), and a cancelled link is dead.
  const cancelToken = "c".repeat(43);
  await withUser(A, async () => {
    const id = (await db.query(insertInvite, [orgId, "cancel@example.com", "member", createHash("sha256").update(cancelToken).digest("hex"), A])).rows[0].id;
    const removed = await db.query("DELETE FROM public.invitations WHERE id = $1 AND organization_id = $2 RETURNING id", [id, orgId]);
    check("owner cancels an invitation", removed.rows.length === 1);
  });
  await withUser(E, async () => {
    check("cancelled link is unknown", (await db.query("SELECT result FROM public.accept_invitation($1)", [cancelToken])).rows[0].result === "not_found");
  });
  await withServiceRole(() => db.query("DELETE FROM public.organization_members WHERE organization_id = $1 AND user_id = $2", [orgId, E]));
}

section("76. content modules become page packages (092)");
{
  const legacy = [
    { version: 1, id: "release", title: "Release checklist", description: "Before shipping", category: "Delivery", blocks: [
      { type: "checklist", title: "Gates", items: [{ label: "Tests pass", done: true }, { label: "Notes reviewed", done: false }] },
      { type: "text", title: "Plan", text: "Ship on Friday\nRoll back if needed" },
      { type: "links", title: "Docs", items: [{ label: "Guide", url: "https://useguidon.com/developers" }] },
    ] },
    { version: 1, id: "taken", title: "Taken id", description: "", blocks: [{ type: "text", title: "Note", text: "Body" }] },
    { id: "broken", title: "", blocks: [] },
  ];
  let legacyProject;
  await withUser(A, async () => {
    legacyProject = (await db.query("INSERT INTO public.projects (organization_id, name, visibility) VALUES ($1, 'Legacy modules', 'private') RETURNING id", [orgId])).rows[0].id;
    await db.query("UPDATE public.projects SET custom_modules = $2::jsonb WHERE id = $1", [legacyProject, JSON.stringify(legacy)]);
    await db.query("INSERT INTO public.project_module_packages (project_id, module_id, manifest) VALUES ($1, 'taken', '{\"manifestVersion\":1,\"id\":\"taken\"}')", [legacyProject]);
  });
  const migration = forPglite(await readFile(path.join(DB_DIR, "migrations", "092_content_modules_as_packages.sql"), "utf8"));
  await db.exec(migration);
  const rows = async () => (await db.query("SELECT module_id, manifest, records, settings FROM public.project_module_packages WHERE project_id = $1 ORDER BY module_id", [legacyProject])).rows;
  const converted = await rows();
  check("valid content modules converted, invalid one left out", isDeepStrictEqual(converted.map((row) => row.module_id), ["release", "taken", "taken-page"]), converted.map((row) => row.module_id).join(","));
  for (const row of converted.filter((row) => row.module_id !== "taken")) {
    let manifest = null;
    try { manifest = moduleManifestSchema.parse(row.manifest); } catch (error) { check(`${row.module_id}: manifest passes the app's schema`, false, error.message); continue; }
    let records = null;
    try { records = parseModuleRecords(manifest, row.records); } catch (error) { check(`${row.module_id}: records pass the app's schema`, false, error.message); continue; }
    const source = legacy.find((module) => module.id === row.module_id || `${module.id}-page` === row.module_id);
    let sequence = 0;
    const expected = convertContentModule(source, row.module_id, () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
    const strip = (list) => list.map((record) => ({ ...record, id: "id" }));
    check(`${row.module_id}: SQL conversion equals convertContentModule`, isDeepStrictEqual(manifest, expected.manifest) && isDeepStrictEqual(strip(records), strip(expected.records)) && isDeepStrictEqual(row.settings, expected.settings),
      JSON.stringify({ manifest, settings: row.settings }));
  }
  const release = converted.find((row) => row.module_id === "release");
  check("checklist state and text survive as records", release.records.some((record) => record.values.label === "Tests pass" && record.values.done === true) && release.records.some((record) => record.values.text === "Ship on Friday\nRoll back if needed"));
  await db.exec(migration);
  check("running 092 again converts nothing twice", (await rows()).length === 3);
  await withUser(A, async () => {
    for (let i = 0; i < 17; i++) await db.query("INSERT INTO public.project_module_packages (project_id, module_id, manifest) VALUES ($1, $2, $3)", [legacyProject, `fill-${i}`, JSON.stringify({ manifestVersion: 1, id: `fill-${i}` })]);
    check("the package cap is enforced again after 092", await throwsInSavepoint("INSERT INTO public.project_module_packages (project_id, module_id, manifest) VALUES ($1, 'over', '{\"manifestVersion\":1,\"id\":\"over\"}')", [legacyProject]));
  });
  await withUser(B, async () => {
    check("converted packages stay private to their project", (await db.query("SELECT 1 FROM public.project_module_packages WHERE project_id = $1", [legacyProject])).rows.length === 0);
  });
}

section("77. module registry: publish, review, withdraw, report, counts (093)");
{
  const manifestFor = (id, version) => JSON.stringify({ manifestVersion: 1, id, name: `Registry ${id}`, version, author: { name: "A" }, engine: { minVersion: "1.0.0" }, permissions: ["module-data:read"], entities: [], views: [] });
  const submit = (id, version, visibility, org = null) => db.query("SELECT public.submit_module_version($1,$2,$3,$4,'planning','Registry test','First','MIT',$5::jsonb) AS status", [id, version, visibility, org, manifestFor(id, version)]);
  let registryProject;
  // An organization A is not a member of.
  const foreignOrg = await withUser(B, async () => (await db.query("INSERT INTO public.organizations (name, slug) VALUES ('Registry outsiders', 'registry-outsiders') RETURNING id")).rows[0].id);
  await withUser(A, async () => {
    check("a private version is published at once", (await submit("reg-private", "1.0.0", "private")).rows[0].status === "published");
    check("an organization version is published at once", (await submit("reg-org", "1.0.0", "organization", orgId)).rows[0].status === "published");
    check("a public version waits for review", (await submit("reg-public", "1.0.0", "public")).rows[0].status === "pending_review");
    check("the author sees their pending version", (await db.query("SELECT 1 FROM public.module_catalog_entries WHERE module_id='reg-public'")).rows.length === 1);
    check("a version cannot be published twice", await throwsInSavepoint("SELECT public.submit_module_version('reg-private','1.0.0','private',NULL,'planning','x','','MIT',$1::jsonb)", [manifestFor("reg-private", "1.0.0")]));
    check("publishing to an organization needs membership", await throwsInSavepoint("SELECT public.submit_module_version('reg-other','1.0.0','organization',$1,'planning','x','','MIT',$2::jsonb)", [foreignOrg, manifestFor("reg-other", "1.0.0")]));
    check("authenticated users cannot write the registry tables directly", await throwsInSavepoint("INSERT INTO public.module_listings(module_id) VALUES ('direct')"));
    check("…nor the audit log", await throwsInSavepoint("INSERT INTO public.module_registry_events(module_id,action) VALUES ('reg-private','approved')"));
    const digest = (await db.query("SELECT digest FROM public.module_catalog_entries WHERE module_id='reg-private'")).rows[0].digest;
    check("every version carries the SHA-256 of its manifest", /^[0-9a-f]{64}$/.test(digest ?? ""), digest);
    registryProject = (await db.query("INSERT INTO public.projects (organization_id, name, visibility) VALUES ($1, 'Registry installs', 'private') RETURNING id", [orgId])).rows[0].id;
  });
  await withUser(B, async () => {
    const visible = (await db.query("SELECT module_id FROM public.module_catalog_entries WHERE module_id LIKE 'reg-%'")).rows.map((row) => row.module_id);
    check("another user sees neither private, other-organization nor pending versions", visible.length === 0, visible.join(","));
    check("only the publisher adds versions to a module id", await throwsInSavepoint("SELECT public.submit_module_version('reg-public','1.1.0','public',NULL,'planning','x','','MIT',$1::jsonb)", [manifestFor("reg-public", "1.1.0")]));
    check("a hidden version cannot be reported", (await db.query("SELECT public.report_module_version('reg-public','1.0.0','spam','') AS r")).rows[0].r === "not_found");
  });
  await withServiceRole(async () => {
    check("submitted content is immutable, even for the service role", await throwsInSavepoint("UPDATE public.module_catalog_entries SET description='changed' WHERE module_id='reg-public'"));
    check("…its manifest too", await throwsInSavepoint("UPDATE public.module_catalog_entries SET manifest=$1::jsonb WHERE module_id='reg-public'", [manifestFor("reg-public", "1.0.0").replace("Registry", "Changed")]));
    check("a published version cannot be deleted", await throwsInSavepoint("DELETE FROM public.module_catalog_entries WHERE module_id='reg-private'"));
    check("the submitter cannot review their own version", (await db.query("SELECT public.review_module_version('reg-public','1.0.0',$1,'approve','') AS r", [A])).rows[0].r === "self_review");
    check("…not even by writing the row directly", await throwsInSavepoint("UPDATE public.module_catalog_entries SET status='published', published=true, reviewed_by=$1 WHERE module_id='reg-public'", [A]));
    check("another admin approves it", (await db.query("SELECT public.review_module_version('reg-public','1.0.0',$1,'approve','Looks good') AS r", [B])).rows[0].r === "published");
    check("a decided version is not reviewed again", (await db.query("SELECT public.review_module_version('reg-public','1.0.0',$1,'reject','') AS r", [B])).rows[0].r === "not_pending");
    check("the decision is in the audit log", (await db.query("SELECT action FROM public.module_registry_events WHERE module_id='reg-public' ORDER BY id")).rows.map((row) => row.action).join(",") === "submitted,approved");
    check("the audit log is append-only", await throwsInSavepoint("UPDATE public.module_registry_events SET note='x' WHERE module_id='reg-public'"));
    check("review notifications are a known type", (await db.query("INSERT INTO public.notifications (user_id,type,title,link) VALUES ($1,'module_review','Module approved','/my-modules') RETURNING id", [A])).rows.length === 1);
  });
  await withUser(B, async () => {
    check("an approved public version is visible to everyone signed in", (await db.query("SELECT 1 FROM public.module_catalog_entries WHERE module_id='reg-public' AND status='published'")).rows.length === 1);
    check("a visible version can be reported", (await db.query("SELECT public.report_module_version('reg-public','1.0.0','misleading','Wrong description') AS r")).rows[0].r === "reported");
    check("one open report per person and version", (await db.query("SELECT public.report_module_version('reg-public','1.0.0','spam','') AS r")).rows[0].r === "already_reported");
    check("the reporter sees their report", (await db.query("SELECT 1 FROM public.module_reports WHERE module_id='reg-public'")).rows.length === 1);
    check("someone else cannot withdraw the version", (await db.query("SELECT public.withdraw_module_version('reg-public','1.0.0') AS ok")).rows[0].ok === false);
    check("someone else gets no install counts for it", (await db.query("SELECT 1 FROM public.module_install_counts() WHERE module_id='reg-public'")).rows.length === 0);
    check("someone else cannot read its audit log", (await db.query("SELECT 1 FROM public.module_registry_events WHERE module_id='reg-public'")).rows.length === 0);
  });
  await withUser(A, async () => {
    check("the author cannot read who reported", (await db.query("SELECT 1 FROM public.module_reports WHERE module_id='reg-public'")).rows.length === 0);
    await db.query("INSERT INTO public.project_module_packages (project_id,module_id,manifest,catalog_version) VALUES ($1,'reg-public',$2::jsonb,'1.0.0')", [registryProject, manifestFor("reg-public", "1.0.0")]);
    check("an installation must name a real registry version", await throwsInSavepoint("INSERT INTO public.project_module_packages (project_id,module_id,manifest,catalog_version) VALUES ($1,'reg-org',$2::jsonb,'9.9.9')", [registryProject, manifestFor("reg-org", "9.9.9")]));
    const counts = (await db.query("SELECT installs::int, open_reports::int FROM public.module_install_counts() WHERE module_id='reg-public'")).rows[0];
    check("the author sees installs and open reports as counts", counts?.installs === 1 && counts?.open_reports === 1, JSON.stringify(counts));
    check("the author withdraws a version", (await db.query("SELECT public.withdraw_module_version('reg-public','1.0.0') AS ok")).rows[0].ok === true);
  });
  await withUser(B, async () => {
    check("a withdrawn version leaves the catalog", (await db.query("SELECT 1 FROM public.module_catalog_entries WHERE module_id='reg-public'")).rows.length === 0);
  });
  await withServiceRole(async () => {
    check("a withdrawn version stays withdrawn", await throwsInSavepoint("UPDATE public.module_catalog_entries SET status='published', published=true WHERE module_id='reg-public'"));
  });
  await withUser(A, async () => {
    check("existing installations keep working after a withdrawal", (await db.query("SELECT 1 FROM public.project_module_packages WHERE project_id=$1 AND module_id='reg-public' AND installed", [registryProject])).rows.length === 1);
  });
}

section("78. module automation runs: manager-only log, server-only writes, dedupe (094)");
{
  let runProject;
  const manifest = JSON.stringify({ manifestVersion: 1, id: "auto-mod", version: "1.0.0" });
  await withUser(A, async () => {
    runProject = (await db.query("INSERT INTO public.projects (organization_id, name, visibility) VALUES ($1, 'Automations', 'private') RETURNING id", [orgId])).rows[0].id;
    await db.query("INSERT INTO public.project_module_packages (project_id, module_id, manifest) VALUES ($1, 'auto-mod', $2::jsonb)", [runProject, manifest]);
    check("authenticated users cannot queue automation runs", await throwsInSavepoint("INSERT INTO public.module_automation_runs (project_id,module_id,automation_id,record_id,event,dedupe_key,next_attempt_at) VALUES ($1,'auto-mod','a',gen_random_uuid(),'record.created','x',now())", [runProject]));
  });
  const insertRun = "INSERT INTO public.module_automation_runs (project_id,module_id,automation_id,record_id,event,dedupe_key,triggered_by,next_attempt_at) VALUES ($1,'auto-mod','notify-me','00000000-0000-4000-8000-000000000001','record.created',$2,$3,now()) RETURNING id";
  await withServiceRole(async () => {
    check("the server queues a run", (await db.query(insertRun, [runProject, "auto-mod:notify-me:1:record.created:r1", A])).rows.length === 1);
    check("the same event is one run (dedupe key)", await throwsInSavepoint(insertRun, [runProject, "auto-mod:notify-me:1:record.created:r1", A]));
    check("a pending run needs a time", await throwsInSavepoint("UPDATE public.module_automation_runs SET next_attempt_at = NULL WHERE project_id = $1", [runProject]));
    check("a run belongs to an installed package", await throwsInSavepoint("INSERT INTO public.module_automation_runs (project_id,module_id,automation_id,record_id,event,dedupe_key,next_attempt_at) VALUES ($1,'missing','a',gen_random_uuid(),'record.created','y',now())", [runProject]));
    check("organization webhooks accept module.automation", (await db.query("INSERT INTO public.organization_webhooks (organization_id,url,events,secret_encrypted) VALUES ($1,'https://hooks.example.test/a',ARRAY['module.automation'],'x') RETURNING id", [orgId])).rows.length === 1);
    check("…and nothing unknown", await throwsInSavepoint("INSERT INTO public.organization_webhooks (organization_id,url,events,secret_encrypted) VALUES ($1,'https://hooks.example.test/b',ARRAY['module.anything'],'x')", [orgId]));
    check("automation notifications are a known type", (await db.query("INSERT INTO public.notifications (user_id,type,title,link) VALUES ($1,'module_automation','Bug filed','/x') RETURNING id", [A])).rows.length === 1);
  });
  await withUser(A, async () => {
    check("the project owner reads the automation log", (await db.query("SELECT 1 FROM public.module_automation_runs WHERE project_id = $1", [runProject])).rows.length === 1);
    check("…but cannot rewrite it", (await db.query("UPDATE public.module_automation_runs SET status = 'succeeded' WHERE project_id = $1 RETURNING id", [runProject]).catch(() => ({ rows: [] }))).rows.length === 0);
  });
  await withServiceRole(async () => { await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'developer')", [runProject, B]); });
  await withUser(B, async () => {
    check("a developer does not see the automation log", (await db.query("SELECT 1 FROM public.module_automation_runs WHERE project_id = $1", [runProject])).rows.length === 0);
  });
  await withServiceRole(async () => { await db.query("DELETE FROM public.project_members WHERE project_id = $1 AND user_id = $2", [runProject, B]); });
}

section("79. task page keyset uses the index path, same pages as 072 (095)");
{
  // 072's single-statement version, kept here as the reference the faster 095 must match.
  const reference = `SELECT t.id FROM public.tasks t WHERE t.project_id = $1 AND ($3::uuid IS NULL
      OR (EXISTS (SELECT 1 FROM public.tasks a WHERE a.id = $3 AND a.project_id = $1)
          AND (t.created_at, t.id) < ((SELECT a.created_at FROM public.tasks a WHERE a.id = $3 AND a.project_id = $1), $3))
      OR (NOT EXISTS (SELECT 1 FROM public.tasks a WHERE a.id = $3 AND a.project_id = $1)
          AND (date_trunc('milliseconds', t.created_at), t.id) < (date_trunc('milliseconds', $4::timestamptz), $3)))
    ORDER BY t.created_at DESC, t.id DESC LIMIT LEAST(GREATEST(COALESCE($2, 1000), 1), 1001)`;
  await withUser(A, async () => {
    // Distinct times, ties within a millisecond and identical microseconds.
    const created = (await db.query(`INSERT INTO public.tasks (project_id, title, created_at)
      SELECT $1, 'keyset ' || g, timestamptz '2026-10-27 10:00:00+00' + ((g / 3) * interval '1 second') + ((g % 3) * interval '100 microseconds')
      FROM generate_series(1, 40) g RETURNING id, created_at`, [projectId])).rows;
    const ids = (await db.query("SELECT id FROM public.list_project_tasks_page($1, 1000)", [projectId])).rows.map((row) => row.id);
    let same = true;
    for (const [index, cursor] of [null, ...ids.slice(0, 45)].entries()) {
      const at = cursor ? (await db.query("SELECT created_at FROM public.tasks WHERE id = $1", [cursor])).rows[0].created_at : null;
      const fast = (await db.query("SELECT id FROM public.list_project_tasks_page($1, 7, $2, $3)", [projectId, cursor, at])).rows.map((row) => row.id);
      const slow = (await db.query(reference, [projectId, 7, cursor, at])).rows.map((row) => row.id);
      if (!isDeepStrictEqual(fast, slow)) { same = false; check(`page after cursor #${index} equals 072`, false, `${fast} vs ${slow}`); break; }
    }
    check("every page (no cursor, each cursor) equals 072's result", same);
    // A cursor id from another project is treated like a deleted task (its time from the cursor), never as an anchor.
    const at = created[10].created_at;
    const foreign = (await db.query("SELECT id FROM public.list_project_tasks_page($1, 5, $2, $3)", [projectId, otherTaskId, at])).rows.map((row) => row.id);
    const expected = (await db.query(reference, [projectId, 5, otherTaskId, at])).rows.map((row) => row.id);
    check("a cursor on another project's task behaves as a deleted one", isDeepStrictEqual(foreign, expected) && foreign.length === 5, `${foreign}`);
    // Deleted cursor task, millisecond-precision time as the API encodes it.
    const victim = ids[20];
    const victimAt = new Date((await db.query("SELECT created_at FROM public.tasks WHERE id = $1", [victim])).rows[0].created_at).toISOString();
    await db.query("DELETE FROM public.tasks WHERE id = $1", [victim]);
    const afterDelete = (await db.query("SELECT id FROM public.list_project_tasks_page($1, 6, $2, $3)", [projectId, victim, victimAt])).rows.map((row) => row.id);
    const afterDeleteReference = (await db.query(reference, [projectId, 6, victim, victimAt])).rows.map((row) => row.id);
    check("deleted cursor task: same page as 072", isDeepStrictEqual(afterDelete, afterDeleteReference) && afterDelete.length === 6, `${afterDelete} vs ${afterDeleteReference}`);
    check("limit is still clamped to 1..1001", (await db.query("SELECT count(*)::int n FROM public.list_project_tasks_page($1, 0)", [projectId])).rows[0].n === 1);
    await db.query("DELETE FROM public.tasks WHERE project_id = $1 AND title LIKE 'keyset %'", [projectId]);
  });
  await withUser("eeeeeeee-0000-4000-8000-000000000095", async () => {
    check("strangers still get nothing (RLS)", (await db.query("SELECT id FROM public.list_project_tasks_page($1, 10)", [projectId])).rows.length === 0);
  });
}

section("80. sign-up funnel: cohorts from existing data, anonymous CTA counts (096)");
{
  const [onlySignup, active, paying, tester] = [
    "f0000000-0000-4000-8000-000000000096", "f1000000-0000-4000-8000-000000000096",
    "f2000000-0000-4000-8000-000000000096", "f3000000-0000-4000-8000-000000000096",
  ];
  // One cohort three weeks back, where no other test user signed up.
  for (const [id, email] of [[onlySignup, "one@funnel.test"], [active, "two@funnel.test"], [paying, "three@funnel.test"], [tester, "qa@funnel.example.test"]]) {
    await db.query("INSERT INTO auth.users (id, email, created_at) VALUES ($1, $2, date_trunc('week', now()) - interval '21 days' + interval '1 day')", [id, email]);
  }
  for (const user of [active, paying, tester]) {
    await withUser(user, async () => {
      const org = (await db.query("INSERT INTO public.organizations (name, slug) VALUES ($1, $1) RETURNING id", [`funnel-${user.slice(0, 2)}`])).rows[0].id;
      const project = (await db.query("INSERT INTO public.projects (organization_id, name, created_by) VALUES ($1, 'Funnel', $2) RETURNING id", [org, user])).rows[0].id;
      await db.query("INSERT INTO public.tasks (project_id, title, created_by) VALUES ($1, 'First', $2)", [project, user]);
      if (user !== active) await db.query("INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'k', 'guidon_fun', $2, '{tasks:read}')", [user, user.replace(/-/g, "")]);
    });
  }
  await withServiceRole(async () => {
    await db.query(`UPDATE public.subscriptions s SET checkout_started_at = now(), stripe_subscription_id = 'sub_funnel', status = 'active', plan_id = 'pro'
      FROM public.organization_members m WHERE m.organization_id = s.organization_id AND m.user_id = $1 AND m.role = 'owner'`, [paying]);
    const rows = (await db.query("SELECT * FROM public.admin_funnel_cohorts(8)")).rows;
    const target = (await db.query("SELECT (date_trunc('week', now()) - interval '21 days')::date AS w")).rows[0].w;
    const cohort = rows.find((row) => new Date(row.week).getTime() === new Date(target).getTime());
    check("the cohort counts each step once per person, test accounts left out",
      cohort && isDeepStrictEqual([cohort.signed_up, cohort.created_project, cohort.created_task, cohort.connected_integration, cohort.started_checkout, cohort.paid], [3, 2, 2, 1, 1, 1]),
      JSON.stringify(cohort));
    check("the result is counts only (no identifiers)", rows.every((row) => isDeepStrictEqual(Object.keys(row).sort(), ["connected_integration", "created_project", "created_task", "paid", "signed_up", "started_checkout", "week"])));
    await db.query("SELECT public.record_funnel_cta('hero-start')");
    await db.query("SELECT public.record_funnel_cta('hero-start')");
    check("a click adds one to today's total", (await db.query("SELECT count FROM public.funnel_cta_counts WHERE cta = 'hero-start' AND day = (now() AT TIME ZONE 'utc')::date")).rows[0]?.count === 2);
    check("a button name outside the format is refused", await throwsInSavepoint("SELECT public.record_funnel_cta('Bad Name <script>')"));
  });
  for (const user of [A, paying]) {
    await withUser(user, async () => {
      check("signed-in users can't read the funnel", await throwsInSavepoint("SELECT * FROM public.admin_funnel_cohorts(8)"));
      check("…or the button counts", await throwsInSavepoint("SELECT * FROM public.funnel_cta_counts"));
      check("…or add to them", await throwsInSavepoint("SELECT public.record_funnel_cta('hero-start')"));
    });
  }
}

section("81. Smart Linking: task_links provenance, review, RLS and history (097)");
{
  let linkProject, linkTask, explicitId, suggestionId;
  const stranger = "eeeeeeee-0000-4000-8000-000000000097";
  await withUser(A, async () => {
    linkProject = (await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1, 'Links') RETURNING id", [orgId])).rows[0].id;
    linkTask = (await db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Login redirect loops') RETURNING id", [linkProject])).rows[0].id;
  });
  await withServiceRole(async () => {
    await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer'), ($1, $3, 'developer') ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role", [linkProject, B, C]);
  });
  const link = (fields) => ({ kind: "pull_request", repository: "acme/web", external_ref: "42", status: "confirmed", provenance: "explicit_reference", confidence: 1, ...fields });
  const insert = (fields) => db.query(`INSERT INTO public.task_links (task_id, project_id, kind, repository, external_ref, status, provenance, confidence, evidence)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'test') RETURNING id, project_id`, [fields.task_id, fields.project_id, fields.kind, fields.repository, fields.external_ref, fields.status, fields.provenance, fields.confidence]);

  await withUser(C, async () => {
    const created = await insert(link({ task_id: linkTask, project_id: otherProjectId }));
    explicitId = created.rows[0].id;
    check("a developer records a link; project_id always comes from the task", created.rows[0].project_id === linkProject);
    suggestionId = (await insert(link({ task_id: linkTask, project_id: linkProject, external_ref: "43", status: "suggested", provenance: "suggestion", confidence: 0.7 }))).rows[0].id;
    check("a suggestion can't claim certainty", await throwsInSavepoint(`INSERT INTO public.task_links (task_id, kind, repository, external_ref, status, provenance, confidence) VALUES ($1, 'pull_request', 'acme/web', '44', 'suggested', 'suggestion', 1)`, [linkTask]));
    check("only suggestions wait for review", await throwsInSavepoint(`INSERT INTO public.task_links (task_id, kind, repository, external_ref, status, provenance, confidence) VALUES ($1, 'pull_request', 'acme/web', '45', 'suggested', 'explicit_reference', 1)`, [linkTask]));
    check("the same target is linked once per task", await throwsInSavepoint(`INSERT INTO public.task_links (task_id, kind, repository, external_ref, status, provenance) VALUES ($1, 'pull_request', 'acme/web', '42', 'confirmed', 'manual')`, [linkTask]));
    check("only github.com URLs", await throwsInSavepoint(`INSERT INTO public.task_links (task_id, kind, repository, external_ref, status, provenance, url) VALUES ($1, 'commit', 'acme/web', 'abc1234', 'confirmed', 'manual', 'javascript:alert(1)')`, [linkTask]));
    const withUrl = await db.query(`INSERT INTO public.task_links (task_id, kind, repository, external_ref, status, provenance, url) VALUES ($1, 'commit', 'acme/web', 'abc1234', 'confirmed', 'manual', 'https://github.com/acme/web/commit/abc1234') RETURNING id`, [linkTask]);
    check("…and a github.com URL is accepted", withUrl.rows.length === 1);
    const removed = await db.query("DELETE FROM public.task_links WHERE id = $1 RETURNING id", [withUrl.rows[0].id]);
    check("a developer can't delete a link (owner/admin only)", removed.rows.length === 0);
    check("a link keeps its target and provenance", await throwsInSavepoint("UPDATE public.task_links SET external_ref = '99', provenance = 'manual' WHERE id = $1", [explicitId]));
    const confirmed = await db.query("UPDATE public.task_links SET status = 'confirmed', decided_by = $2, decided_at = now() WHERE id = $1 AND project_id = $3 RETURNING id", [suggestionId, C, linkProject]);
    check("a developer confirms a suggestion", confirmed.rows.length === 1);
    await db.query("UPDATE public.task_links SET status = 'rejected', decided_by = $2, decided_at = now() WHERE id = $1", [explicitId, C]);
  });
  await withUser(B, async () => {
    check("a viewer reads the links", (await db.query("SELECT id FROM public.task_links WHERE task_id = $1", [linkTask])).rows.length === 3);
    const changed = await db.query("UPDATE public.task_links SET status = 'confirmed' WHERE id = $1 RETURNING id", [explicitId]);
    check("…but can't confirm or reject", changed.rows.length === 0);
    check("…or add one", await throwsInSavepoint(`INSERT INTO public.task_links (task_id, kind, repository, external_ref, status, provenance) VALUES ($1, 'commit', 'acme/web', 'abc1234', 'confirmed', 'manual')`, [linkTask]));
  });
  await withUser(stranger, async () => {
    check("another tenant sees no links", (await db.query("SELECT id FROM public.task_links WHERE task_id = $1", [linkTask])).rows.length === 0);
  });
  await withUser(C, async () => {
    check("a developer can't link a task of a project they're not in", await throwsInSavepoint(`INSERT INTO public.task_links (task_id, kind, repository, external_ref, status, provenance) VALUES ($1, 'commit', 'acme/web', 'abc1234', 'confirmed', 'manual')`, [otherTaskId]));
  });
  await withServiceRole(async () => {
    const events = (await db.query("SELECT event_type FROM public.context_events WHERE entity_id = $1 AND event_type LIKE 'task.link_%' ORDER BY seq", [linkTask])).rows.map((row) => row.event_type);
    check("history: created, suggested, confirmed and rejected are events", ["task.link_created", "task.link_suggested", "task.link_confirmed", "task.link_rejected"].every((type) => events.includes(type)), events.join(","));
  });
  await withUser(A, async () => {
    await db.query("DELETE FROM public.tasks WHERE id = $1", [linkTask]);
  });
  await withServiceRole(async () => {
    check("a deleted task takes its links with it", (await db.query("SELECT count(*)::int n FROM public.task_links WHERE task_id = $1", [linkTask])).rows[0].n === 0);
  });
}

section("82. Living memory: unverified insights leave with their evidence (098)");
{
  let memProject, reopenTask, deleteTask;
  const learned = async (taskId, content, verified) => {
    const memoryId = (await db.query("INSERT INTO public.project_memory (project_id, content, memory_type, verified, created_by) VALUES ($1, $2, 'ai_insight', $3, $4) RETURNING id", [memProject, content, verified, A])).rows[0].id;
    await db.query("INSERT INTO public.context_relations (source_type, source_id, target_type, target_id, relation_type, created_by, metadata) VALUES ('memory', $1, 'task', $2, 'based_on', $3, '{\"origin\":\"task_learning\"}'::jsonb)", [memoryId, taskId, A]);
    return memoryId;
  };
  const exists = async (id) => (await db.query("SELECT 1 FROM public.project_memory WHERE id = $1", [id])).rows.length === 1;
  let pending, accepted, manual, onDeleted, keptOnDelete;
  await withUser(A, async () => {
    memProject = (await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1, 'Living memory') RETURNING id", [orgId])).rows[0].id;
    reopenTask = (await db.query("INSERT INTO public.tasks (project_id, title, status) VALUES ($1, 'Shrink the APK', 'done') RETURNING id, is_done", [memProject])).rows[0];
    check("the source task starts finished", reopenTask.is_done === true);
    deleteTask = (await db.query("INSERT INTO public.tasks (project_id, title, status) VALUES ($1, 'Cloud saves', 'done') RETURNING id", [memProject])).rows[0].id;
    reopenTask = reopenTask.id;
    pending = await learned(reopenTask, "Android builds must stay under 150 MB.", false);
    accepted = await learned(reopenTask, "Release builds strip debug symbols.", true);
    // A relation someone added by hand (no task_learning origin) is not the learner's.
    manual = (await db.query("INSERT INTO public.project_memory (project_id, content, memory_type, verified, created_by) VALUES ($1, 'Builds are signed in CI.', 'ai_insight', false, $2) RETURNING id", [memProject, A])).rows[0].id;
    await db.query("INSERT INTO public.context_relations (source_type, source_id, target_type, target_id, relation_type, created_by) VALUES ('memory', $1, 'task', $2, 'based_on', $3)", [manual, reopenTask, A]);
    onDeleted = await learned(deleteTask, "Save files live in user://saves as JSON.", false);
    keptOnDelete = await learned(deleteTask, "Saves sync on app pause.", true);

    await db.query("UPDATE public.tasks SET status = 'in_progress' WHERE id = $1", [reopenTask]);
    check("reopening the task withdraws the insight still waiting for review", !(await exists(pending)));
    check("…its relation goes with it, so finishing again learns again", (await db.query("SELECT 1 FROM public.context_relations WHERE source_id = $1", [pending])).rows.length === 0);
    check("an insight a person accepted stays", await exists(accepted));
    check("an insight linked by hand stays", await exists(manual));
    await db.query("UPDATE public.tasks SET title = 'Shrink the APK more' WHERE id = $1", [reopenTask]);
    check("other edits of an open task change nothing", await exists(accepted) && await exists(manual));

    await db.query("DELETE FROM public.tasks WHERE id = $1", [deleteTask]);
    check("deleting the task withdraws its pending insight", !(await exists(onDeleted)));
    check("…and keeps the accepted one", await exists(keptOnDelete));
  });
  await withUser(A, async () => {
    const before = (await db.query("SELECT count(*)::int n FROM public.project_memory WHERE project_id = $1", [memProject])).rows[0].n;
    check("there is memory left to cascade", before >= 2, String(before));
    await db.query("DELETE FROM public.projects WHERE id = $1", [memProject]);
  });
  await withServiceRole(async () => {
    check("deleting the whole project still works (cascade skips the trigger)", (await db.query("SELECT count(*)::int n FROM public.project_memory WHERE project_id = $1", [memProject])).rows[0].n === 0);
  });
}

section("83. A person can hide AI for themselves (099)");
{
  await withUser(A, async () => {
    check("AI is shown by default", (await db.query("SELECT hide_ai FROM public.profiles WHERE id = $1", [A])).rows[0]?.hide_ai === false);
    const own = await db.query("UPDATE public.profiles SET hide_ai = true WHERE id = $1 RETURNING hide_ai", [A]);
    check("the owner hides AI on their profile", own.rows[0]?.hide_ai === true);
    const other = await db.query("UPDATE public.profiles SET hide_ai = true WHERE id = $1 RETURNING id", [B]);
    check("…but not on someone else's", other.rows.length === 0);
    check("the email stays read-only (076)", await throwsInSavepoint("UPDATE public.profiles SET email = 'hide-ai@example.com' WHERE id = $1", [A]));
    await db.query("UPDATE public.profiles SET hide_ai = false WHERE id = $1", [A]);
  });
}

section("84. Each project role can do exactly what the Members page says (src/lib/project-permissions.ts)");
{
  const people = {
    admin: "84000000-0000-4000-8000-000000000001",
    developer: "84000000-0000-4000-8000-000000000002",
    tester: "84000000-0000-4000-8000-000000000003",
    viewer: "84000000-0000-4000-8000-000000000004",
  };
  let matrixProject;
  await withUser(A, async () => {
    matrixProject = (await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1, 'Role matrix') RETURNING id", [orgId])).rows[0].id;
  });
  await withServiceRole(async () => {
    for (const [role, id] of Object.entries(people)) {
      // Outside the organization on purpose: the project role is their only access.
      await db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}') ON CONFLICT DO NOTHING", [id, `matrix-${role}@example.test`]);
      await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, $3)", [matrixProject, id, role]);
    }
  });
  const newTask = async () => withServiceRole(async () =>
    (await db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Matrix task') RETURNING id", [matrixProject])).rows[0].id);
  /** True when the statement went through and touched a row; RLS refusals either throw or touch nothing. */
  const went = async (sql, params) => {
    try {
      await db.query("SAVEPOINT m");
      const result = await db.query(sql, params);
      await db.query("RELEASE SAVEPOINT m");
      return result.rows.length > 0;
    } catch {
      await db.query("ROLLBACK TO SAVEPOINT m");
      return false;
    }
  };
  const attempts = {
    view: (user, task) => went("SELECT id FROM public.tasks WHERE id = $1", [task]),
    comment: (user, task) => went("INSERT INTO public.task_comments (task_id, author_id, content) VALUES ($1, $2, 'ok') RETURNING id", [task, user]),
    edit: () => went("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Written by a member') RETURNING id", [matrixProject]),
    delete: (user, task) => went("DELETE FROM public.tasks WHERE id = $1 AND project_id = $2 RETURNING id", [task, matrixProject]),
    manage: () => went("UPDATE public.projects SET description = 'changed' WHERE id = $1 RETURNING id", [matrixProject]),
    own: () => went("DELETE FROM public.projects WHERE id = $1 RETURNING id", [matrixProject]),
  };
  // The owner goes last: "own" deletes the project.
  for (const [role, user] of [...Object.entries(people), ["owner", A]]) {
    for (const [capability, attempt] of Object.entries(attempts)) {
      const task = await newTask();
      const expected = PROJECT_CAPABILITIES[capability].includes(role);
      const actual = await withUser(user, () => attempt(user, task));
      check(`${role} ${expected ? "can" : "cannot"} ${capability}`, actual === expected, `got ${actual}`);
    }
  }
}

section("85. Agents claim a task with a lease: one at a time, expired leases are taken over (100)");
{
  let claimProject, claimTask;
  const key1 = "85000000-0000-4000-8000-000000000001";
  const key2 = "85000000-0000-4000-8000-000000000002";
  const foreignKey = "85000000-0000-4000-8000-000000000003";
  await withUser(A, async () => {
    claimProject = (await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1, 'Claims') RETURNING id", [orgId])).rows[0].id;
    claimTask = (await db.query("INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Shared task') RETURNING id", [claimProject])).rows[0].id;
  });
  await withServiceRole(async () => {
    for (const [id, user] of [[key1, A], [key2, A], [foreignKey, B]]) {
      await db.query("INSERT INTO public.api_keys (id, user_id, name, key_prefix, key_hash, scopes) VALUES ($1, $2, $3, 'guidon_test', $4, '{tasks:write}')", [id, user, `agent ${id.slice(-1)}`, `hash-${id}`]);
    }
    await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer') ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'viewer'", [claimProject, B]);
  });
  const claim = (key, lease = 3600) => db.query("SELECT * FROM public.claim_task($1, $2, $3, $4)", [claimTask, key, `agent ${key.slice(-1)}`, lease]).then((r) => r.rows[0]);

  await withUser(A, async () => {
    const first = await claim(key1);
    check("the first agent claims the task", first.claimed === true && first.holder_key_id === key1);
    const second = await claim(key2);
    check("a second agent is refused while the lease runs", second.claimed === false && second.holder_key_id === key1);
    const renewed = await claim(key1, 7200);
    check("the holder renews its lease", renewed.claimed === true && new Date(renewed.expires_at) > new Date(first.expires_at));
    check("renewing keeps when the work started", new Date(renewed.claimed_at).getTime() === new Date(first.claimed_at).getTime());
    check("people in the project see who holds it", (await db.query("SELECT holder_label FROM public.task_claims WHERE task_id = $1", [claimTask])).rows[0]?.holder_label === "agent 1");
    check("nobody writes claims directly", await throwsInSavepoint("UPDATE public.task_claims SET holder_key_id = $2 WHERE task_id = $1", [claimTask, key2]));
  });
  await withServiceRole(() => db.query("UPDATE public.task_claims SET claimed_at = now() - interval '3 hours', expires_at = now() - interval '1 second' WHERE task_id = $1", [claimTask]));
  await withUser(A, async () => {
    const takeover = await claim(key2);
    check("an expired lease is taken over by the next agent", takeover.claimed === true && takeover.holder_key_id === key2);
    check("the lease is bounded (at most a day)", new Date((await claim(key2, 10 ** 7)).expires_at) - Date.now() <= 86400 * 1000 + 5000);
    await db.query("UPDATE public.tasks SET status = 'ai_working' WHERE id = $1", [claimTask]);
    check("working on it keeps the claim", (await db.query("SELECT 1 FROM public.task_claims WHERE task_id = $1", [claimTask])).rowCount === 1);
    await db.query("UPDATE public.tasks SET status = 'review' WHERE id = $1", [claimTask]);
    check("handing it to review releases the claim", (await db.query("SELECT 1 FROM public.task_claims WHERE task_id = $1", [claimTask])).rowCount === 0);
    check("someone else's key can't be used", await throwsInSavepoint("SELECT * FROM public.claim_task($1, $2, 'x', 60)", [claimTask, foreignKey]));
  });
  await withUser(B, async () => {
    check("a viewer can't claim", await throwsInSavepoint("SELECT * FROM public.claim_task($1, $2, 'x', 60)", [claimTask, foreignKey]));
  });
  await withServiceRole(() => db.query("UPDATE public.api_keys SET revoked_at = now() WHERE id = $1", [key1]));
  await withUser(A, async () => {
    check("a revoked key can't claim", await throwsInSavepoint("SELECT * FROM public.claim_task($1, $2, 'x', 60)", [claimTask, key1]));
  });
}

section("86. A personal API key can expire; the server-only columns stay server-only (101)");
{
  const insertKey = (extra) => db.query(
    `INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes${extra.columns}) VALUES ($1, 'Expiring', 'guidon_exp', $2, '{tasks:read}'${extra.values}) RETURNING id, expires_at`,
    [A, `hash-exp-${Math.random()}`, ...extra.params]
  );
  await withUser(A, async () => {
    const created = await insertKey({ columns: ", expires_at", values: ", $3", params: [new Date(Date.now() + 90 * 86400000).toISOString()] });
    check("the owner creates a key that expires", created.rows[0]?.expires_at !== null);
    check("…but can't mark it as a human-operated client (039)", await throwsInSavepoint(
      "INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, human_client) VALUES ($1, 'x', 'guidon_x', 'hash-hc', '{tasks:read}', true)", [A]));
    check("…nor tie it to an OAuth grant (073)", await throwsInSavepoint(
      "INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes, oauth_grant_id) VALUES ($1, 'x', 'guidon_x', 'hash-og', '{tasks:read}', gen_random_uuid())", [A]));
    check("…nor change the expiry afterwards (only revoked_at is updatable)", await throwsInSavepoint(
      "UPDATE public.api_keys SET expires_at = NULL WHERE id = $1", [created.rows[0].id]));
  });
}

section("87. Agents ask for approval; owners/admins decide (102)");
{
  const dev = "87000000-0000-4000-8000-000000000001";
  const viewer = "87000000-0000-4000-8000-000000000002";
  let project, task, key, otherKey;
  await withUser(A, async () => {
    project = (await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1, 'Approvals') RETURNING id", [orgId])).rows[0].id;
    task = (await db.query("INSERT INTO public.tasks (project_id, title, status) VALUES ($1, 'Ship the save system', 'review') RETURNING id", [project])).rows[0].id;
  });
  await withServiceRole(async () => {
    for (const [id, role] of [[dev, "developer"], [viewer, "viewer"]]) {
      await db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}') ON CONFLICT DO NOTHING", [id, `approvals-${role}@example.test`]);
      await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, $3)", [project, id, role]);
    }
    key = (await db.query("INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'Claude Code', 'guidon_appr', 'appr1', ARRAY['tasks:write']) RETURNING id", [dev])).rows[0].id;
    otherKey = (await db.query("INSERT INTO public.api_keys (user_id, name, key_prefix, key_hash, scopes) VALUES ($1, 'Not yours', 'guidon_appx', 'appr2', ARRAY['tasks:write']) RETURNING id", [A])).rows[0].id;
  });
  const ask = (action, keyId = key) =>
    db.query("SELECT * FROM public.request_agent_approval($1, $2, 'Tests pass on CI', $3, 'Claude Code')", [task, action, keyId]);

  let first;
  await withUser(dev, async () => {
    first = (await ask("complete_task")).rows[0];
    check("a developer's agent asks to complete a task", first?.created === true);
    const again = (await ask("complete_task")).rows[0];
    check("asking again returns the same pending request, not a new one", again.id === first.id && again.created === false);
    check("…a different action is its own request", (await ask("delete_task")).rows[0].created === true);
    check("only through someone's own key", await throwsInSavepoint("SELECT * FROM public.request_agent_approval($1, 'complete_task', null, $2, null)", [task, otherKey]));
    check("unknown actions are refused", await throwsInSavepoint("SELECT * FROM public.request_agent_approval($1, 'drop_project', null, $2, null)", [task, key]));
    check("no direct inserts", await throwsInSavepoint("INSERT INTO public.agent_approval_requests (project_id, task_id, action, requested_by) VALUES ($1, $2, 'complete_task', $3)", [project, task, dev]));
    check("the requester can't decide their own request", await throwsInSavepoint("SELECT * FROM public.decide_agent_approval($1, true, null)", [first.id]));
    const row = (await db.query("SELECT snapshot, app_name, status FROM public.agent_approval_requests WHERE id = $1", [first.id])).rows[0];
    check("the request keeps what the task looked like", row.snapshot.title === "Ship the save system" && row.snapshot.status === "review" && row.app_name === "Claude Code" && row.status === "pending");
  });
  await withUser(viewer, async () => {
    check("a viewer sees the requests", (await db.query("SELECT id FROM public.agent_approval_requests WHERE project_id = $1", [project])).rows.length === 2);
    check("…but can't ask", await throwsInSavepoint("SELECT * FROM public.request_agent_approval($1, 'complete_task', null, null, null)", [task]));
    check("…or decide", await throwsInSavepoint("SELECT * FROM public.decide_agent_approval($1, true, null)", [first.id]));
  });
  await withUser(B, async () => {
    check("someone outside the project sees nothing", (await db.query("SELECT id FROM public.agent_approval_requests WHERE project_id = $1", [project])).rows.length === 0);
  });
  await withUser(A, async () => {
    const decided = (await db.query("SELECT * FROM public.decide_agent_approval($1, false, 'Not before the playtest')", [first.id])).rows[0];
    check("the owner rejects it with a comment", decided.status === "rejected" && decided.decided_by === A && decided.decision_comment === "Not before the playtest");
    check("rejecting changes nothing on the task", (await db.query("SELECT status FROM public.tasks WHERE id = $1", [task])).rows[0].status === "review");
    check("a decided request can't be decided again", await throwsInSavepoint("SELECT * FROM public.decide_agent_approval($1, true, null)", [first.id]));
    check("no direct updates", await throwsInSavepoint("UPDATE public.agent_approval_requests SET status = 'approved' WHERE id = $1", [first.id]));
  });
  await withUser(dev, async () => {
    check("after a decision the agent may ask again", (await ask("complete_task")).rows[0].created === true);
  });
  await withServiceRole(async () => {
    await db.query("UPDATE public.agent_approval_requests SET expires_at = now() - interval '1 minute' WHERE task_id = $1 AND action = 'complete_task' AND status = 'pending'", [task]);
  });
  await withUser(A, async () => {
    const expired = (await db.query("SELECT id FROM public.agent_approval_requests WHERE task_id = $1 AND action = 'complete_task' AND status = 'pending'", [task])).rows[0].id;
    check("an expired request can't be approved", await throwsInSavepoint("SELECT * FROM public.decide_agent_approval($1, true, null)", [expired]));
    const del = (await db.query("SELECT id FROM public.agent_approval_requests WHERE task_id = $1 AND action = 'delete_task'", [task])).rows[0].id;
    const approved = (await db.query("SELECT * FROM public.decide_agent_approval($1, true, null)", [del])).rows[0];
    check("the owner approves", approved.status === "approved");
    await db.query("SELECT public.mark_agent_approval_failed($1, 'boom')", [del]);
    check("…and can record that running it failed", (await db.query("SELECT status FROM public.agent_approval_requests WHERE id = $1", [del])).rows[0].status === "failed");
    await db.query("DELETE FROM public.tasks WHERE id = $1", [task]);
    check("the history stays after the task is deleted", (await db.query("SELECT count(*)::int n FROM public.agent_approval_requests WHERE project_id = $1 AND task_id IS NULL", [project])).rows[0].n >= 2);
  });
  await withUser(dev, async () => {
    const del = (await db.query("SELECT id FROM public.agent_approval_requests WHERE project_id = $1 AND action = 'delete_task'", [project])).rows[0].id;
    await db.query("SELECT public.mark_agent_approval_failed($1, 'not mine')", [del]);
    check("only the decider can mark a failure", (await db.query("SELECT decision_comment FROM public.agent_approval_requests WHERE id = $1", [del])).rows[0].decision_comment === "boom");
  });
}

section("88. Agent brief versions: owners/admins approve, members read (103)");
{
  const dev = "88000000-0000-4000-8000-000000000001";
  let project;
  await withUser(A, async () => {
    project = (await db.query("INSERT INTO public.projects (organization_id, name) VALUES ($1, 'Brief') RETURNING id", [orgId])).rows[0].id;
  });
  await withServiceRole(async () => {
    await db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, 'brief-dev@example.test', '{}') ON CONFLICT DO NOTHING", [dev]);
    await db.query("INSERT INTO public.project_members (project_id, user_id, role) VALUES ($1, $2, 'developer')", [project, dev]);
  });
  await withUser(A, async () => {
    const first = (await db.query("SELECT * FROM public.save_agent_brief($1, '# Brief v1')", [project])).rows[0];
    const second = (await db.query("SELECT * FROM public.save_agent_brief($1, '# Brief v2')", [project])).rows[0];
    check("the owner saves numbered versions", first.version === 1 && second.version === 2 && second.approved_by === A);
    check("versions can't be rewritten", await throwsInSavepoint("UPDATE public.agent_briefs SET content = 'changed' WHERE id = $1", [first.id]));
    check("no direct inserts", await throwsInSavepoint("INSERT INTO public.agent_briefs (project_id, version, content) VALUES ($1, 9, 'x')", [project]));
    check("an empty brief is refused", await throwsInSavepoint("SELECT * FROM public.save_agent_brief($1, '')", [project]));
  });
  await withUser(dev, async () => {
    const rows = (await db.query("SELECT version, content FROM public.agent_briefs WHERE project_id = $1 ORDER BY version", [project])).rows;
    check("a developer reads every version exactly as approved", rows.length === 2 && rows[0].content === "# Brief v1");
    check("…but can't approve one", await throwsInSavepoint("SELECT * FROM public.save_agent_brief($1, '# mine')", [project]));
  });
  await withUser(B, async () => {
    check("someone outside the project reads nothing", (await db.query("SELECT 1 FROM public.agent_briefs WHERE project_id = $1", [project])).rows.length === 0);
    check("…and can't save one", await throwsInSavepoint("SELECT * FROM public.save_agent_brief($1, '# theirs')", [project]));
  });
}

section("89. Anonymous search-quality counters (104)");
await withServiceRole(async () => {
  await db.query("INSERT INTO public.search_quality_counts(day,event,count) VALUES (current_date-90,'zero',1)");
  await db.query("SELECT public.record_search_event('zero')");
  await db.query("SELECT public.record_search_event('zero')");
  const rows=(await db.query("SELECT day,event,count FROM public.search_quality_counts")).rows;
  check("only daily aggregate fields, atomic increments and stale-date pruning", rows.length===1 && rows[0].event==='zero' && Number(rows[0].count)===2);
  check("arbitrary event content is refused", await throwsInSavepoint("SELECT public.record_search_event('PRIVATE QUERY')"));
});
await withUser(A,async()=>{
  check("a signed-in user cannot read the global counters",await throwsInSavepoint("SELECT * FROM public.search_quality_counts"));
  check("a signed-in user cannot execute the privileged counter RPC",await throwsInSavepoint("SELECT public.record_search_event('zero')"));
  check("a signed-in user cannot directly insert a counter",await throwsInSavepoint("INSERT INTO public.search_quality_counts(event,count) VALUES ('click',1)"));
});
check("the counter function does not elevate its caller",(await db.query("SELECT prosecdef FROM pg_proc WHERE oid='public.record_search_event(text)'::regprocedure")).rows[0].prosecdef===false);

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
