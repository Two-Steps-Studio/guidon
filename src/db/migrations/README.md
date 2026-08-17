# Guidon database migrations

Apply in numeric order in the Supabase SQL editor. Each file is wrapped in a
transaction and is safe to re-run.

| File | What it does | Required for |
|---|---|---|
| `001_initial_schema.sql` | RLS policies, helper functions, triggers, foreign keys, indexes, grants. Assumes the tables already exist. | Everything |
| `002_task_status_and_project_slug.sql` | Normalises `tasks.status` to `backlog / todo / in_progress / review / done` (remapping `testing → review`, `completed → done`), pins `tasks.priority`, adds `projects.slug` unique per organization. | The Work board's Backlog and Review columns |
| `003_profile_visibility.sql` | Lets a user read the profiles of people they share an organization or project with. Drops a dead `anon` insert policy and revokes `anon` table grants. | Member lists, assignee names, comment authors |
| `004_project_slug_autofill.sql` | **Required after 002.** Adds a `BEFORE INSERT` trigger that derives `projects.slug` from the project name. | Creating projects at all |
| `005_project_creator_and_drift.sql` | Fixes `projects.created_by` being silently NULL, backfills it from the owner membership, and adds the live-only `set_organization_creator` to the repo. | Correct project attribution |
| `006_fix_service_role_detection.sql` | **Required after 005.** 005 detected the service role with `current_user`, which is the function owner inside `SECURITY DEFINER` and never matches. Replaces it with a JWT-claim check. | Server-side project creation |
| `007_allow_parent_delete.sql` | The last-owner guards fired on `ON DELETE CASCADE`, making projects and organizations impossible to delete. Skips the guard when the parent row is already gone, and clears two smoke-test projects. | Deleting projects/organizations at all |

## Note on 001 — this repo cannot rebuild the database

Two separate gaps:

1. `001_initial_schema.sql` **alters** the schema, it does not create the
   tables. There is no `CREATE TABLE` baseline, so a fresh Supabase project
   cannot be provisioned from these files. Writing `000_baseline_schema.sql`
   is outstanding.

2. The live database contained `private.set_organization_creator()`, which
   appeared in no migration file. 005 brings it into the repo. Until a
   baseline exists, treat the live database — not `001` — as the source of
   truth, and re-run the drift check below after any manual SQL-editor change:

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
