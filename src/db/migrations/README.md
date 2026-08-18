# Guidon database migrations

```bash
npm run migrate:status   # what is applied, what is pending — changes nothing
npm run migrate          # apply everything pending
```

Requires `DATABASE_URL` (Supabase: Project Settings → Database → Connection
string, **not** the REST URL). The runner records every applied file in
`guidon_migrations` with a checksum, so a migration edited after it ran is a
hard error rather than a silent skip.

Files can still be pasted into the Supabase SQL editor by hand — each one is
transactional and safe to re-run — but then the registry will not know about
them. Prefer the runner.

| File | What it does | Required for |
|---|---|---|
| `000_baseline_schema.sql` | Creates all 16 tables. Reproduces the schema **as it was before 002**, so the whole chain applies normally on a fresh database. | Any fresh install |
| `001_initial_schema.sql` | RLS policies, helper functions, triggers, foreign keys, indexes, grants. Assumes the tables already exist. | Everything |
| `002_task_status_and_project_slug.sql` | Normalises `tasks.status` to `backlog / todo / in_progress / review / done` (remapping `testing → review`, `completed → done`), pins `tasks.priority`, adds `projects.slug` unique per organization. | The Work board's Backlog and Review columns |
| `003_profile_visibility.sql` | Lets a user read the profiles of people they share an organization or project with. Drops a dead `anon` insert policy and revokes `anon` table grants. | Member lists, assignee names, comment authors |
| `004_project_slug_autofill.sql` | **Required after 002.** Adds a `BEFORE INSERT` trigger that derives `projects.slug` from the project name. | Creating projects at all |
| `005_project_creator_and_drift.sql` | Fixes `projects.created_by` being silently NULL, backfills it from the owner membership, and adds the live-only `set_organization_creator` to the repo. | Correct project attribution |
| `006_fix_service_role_detection.sql` | **Required after 005.** 005 detected the service role with `current_user`, which is the function owner inside `SECURITY DEFINER` and never matches. Replaces it with a JWT-claim check. | Server-side project creation |
| `007_allow_parent_delete.sql` | The last-owner guards fired on `ON DELETE CASCADE`, making projects and organizations impossible to delete. Skips the guard when the parent row is already gone, and clears two smoke-test projects. | Deleting projects/organizations at all |
| `008_technology_game_engine.sql` | Adds `game_engine` to the `technologies.category` vocabulary. | Unity/Unreal in the Technology tab |
| `009_creator_visibility.sql` | **Fixes organization and project creation.** See below. | Creating organizations or projects at all |

## The compatibility layer runs before all of this

`src/db/bootstrap/000_auth_compat.sql` is not a migration and is not listed
above. It recreates what Supabase provides for free — the `auth` schema,
`auth.users`, `auth.uid()`, and the `anon` / `authenticated` / `service_role`
roles — so that the 70 RLS policies work unchanged on a plain PostgreSQL.

It has to come first, because `000` declares a foreign key to `auth.users` and
`001` grants to `authenticated` 97 times.

The runner applies it only when `auth.uid()` is missing from the database. On
Supabase it exists, so the file is never even read and a managed install cannot
be altered by this path.

Verify the whole chain against a real PostgreSQL, without Docker or a server:

```bash
npm run test:db
```

## Why 009 exists

Creating an organization or a project failed with:

```
new row violates row-level security policy for table "organizations"
```

PostgreSQL applies the `SELECT` policy to the row returned by `RETURNING`, and
`.select()` in supabase-js *is* `RETURNING`. The order is:

1. `BEFORE` trigger sets `created_by`
2. row is inserted
3. `WITH CHECK` of the INSERT policy — passes
4. `USING` of the SELECT policy, for RETURNING — **rejects**
5. `AFTER` trigger creates the owner membership

At step 4 the membership does not exist yet, so `is_org_member()` is false. The
row was written correctly and then rolled back on the way out, which is why the
table looked fine afterwards and the bug was easy to misattribute.

Only `organizations` and `projects` are affected — their SELECT policy asks
about their own `id`. Child tables ask about `project_id` of a parent that is
already visible, and were verified to be unaffected.

009 lets the creator see what they just created. The trade-off is deliberate
and documented in the file: the clause does not expire, so someone later removed
from an organization keeps read access to that one row.

## Drift

`000` closed the "no baseline" gap, but one lesson stands: the live database
once contained `private.set_organization_creator()` which appeared in no
migration file at all. 005 brought it into the repo. Re-run this after any
manual change made directly in the SQL editor:

```sql
SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private' ORDER BY p.proname;
```

### `current_user` is not the caller

Inside a `SECURITY DEFINER` function `current_user` is the **function owner**,
so `current_user = 'service_role'` is never true. 001 uses that comparison three
times; there it is dead code rather than a bug, because each use is ANDed with
`auth.uid() IS NOT NULL`, which is already false for a service-role request.
Use `private.is_service_role()` (006) for any new check that needs to branch on
the caller's role.

### Trigger timing matters here

`on_organization_created` and `on_project_created` are **AFTER INSERT**
triggers. Assigning `NEW.<column>` inside them does nothing to the stored row.
Both `handle_new_organization()` and `handle_new_project()` contain such an
assignment, which is why ownership columns need `BEFORE` triggers (004, 005) or
a column `DEFAULT` to actually persist.

## Note on 002 and 004

002 added `projects.slug` as `NOT NULL` **with no default**, which breaks every
existing project-creation path. 004 fixes that with a trigger and must be run
alongside it. The application also computes a slug itself
(`uniqueSlug` in `src/lib/slug.ts`), so creation works either way — but run 004
so that scripts and SQL-editor inserts cannot hit the same wall.

The application tolerates both the old and the new task status vocabulary at
read time (`normalizeTaskStatus` in `src/lib/work/task-board.ts`), so the Work
board renders correctly before and after 002.

## Note on 003

Until this is applied, every query that joins `profiles` returns null for other
users. The UI degrades to "Unknown member" rather than dropping the row, but
member names will not appear.
