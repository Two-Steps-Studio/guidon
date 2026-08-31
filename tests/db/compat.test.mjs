#!/usr/bin/env node
/**
 * Proves the schema works on a plain PostgreSQL — no Supabase, no Docker.
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
 * connection — which makes it the strictest possible test for §4, since any
 * identity residue would be inherited immediately by the next transaction.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** Mirrors src/lib/db/session.ts exactly — if that changes, change this too. */
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

/** Mirrors src/lib/db/session.ts's withAnon — no identity at all. */
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
  // zostaja takie same.
  ["24 tabele", "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'", 24],
  ["92 polityki RLS", "SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'", 92],
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
 * row" from "RLS is merely hiding a row that is still physically there" —
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

// One source-side check per entity table — this is what actually exercises
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
// one table needs covering here — the string-matching logic is identical
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
// that never referenced it — otherwise the WHERE clause could be too broad
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

// signUpLocal() i signInLocal() dzialaja wylacznie przez withServiceRole() —
// nigdy pod tozsamoscia authenticated/anon — bo auth.users ma RLS wlaczone
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
section("13. task_attempts — Previous Attempts (migracja 013)");

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
section("14. project_limit — grant na poziomie kolumny (migracja 014)");

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
    "4 plany zaseedowane w kolejnosci",
    rows.length === 4 && rows.map((r) => r.id).join(",") === "free,pro,team,business",
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
    `INSERT INTO public.invitations (organization_id, email, role, token, invited_by, expires_at)
     VALUES ($1, 'ktos@example.test', 'member', 'tok-017', $2, now() + interval '7 days')
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
    "kazdy plan ma ustawiona cene PLN",
    rows.every((r) => r.price_pln_cents !== null),
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

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
