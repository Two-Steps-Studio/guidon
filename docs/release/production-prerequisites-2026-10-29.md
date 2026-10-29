# Production prerequisites - 2026-10-29

Related Guidon tasks: `f141afb1-c8cb-4fa1-a673-6caa66fc47bf` and `f3bdc95c-1b04-41b7-8418-04c59ab99631`.

## Read-only findings

- Supabase REST request selecting `tasks.revision` with `limit=0` returned HTTP 400, PostgreSQL error `42703`: column does not exist. No task contents were fetched and no task was changed.
- The migration registry's newest entry is `055_project_modules.sql`. This confirms the earlier history discrepancy, not that every later migration is missing. Later features can have been applied manually.
- Public production `/api/health` returned 200: web, database and storage OK, password auth advertised; billing not configured. A healthy connection does not establish complete schema or working email delivery.
- The Google local callback and session were verified separately; production frontend provider enablement is still unverified. GitHub awaits owner 2FA.
- Production Resend sender/key, Sentry alert delivery, uptime notification delivery and backup recovery have not been independently verified in this pass. Do not infer them from local environment files or a 200 health response.

## Task description editing

The web edit dialog needs a valid revision to conditionally save its snapshot. Missing revision causes the reported refusal, as designed. The calendar projection fix already exists in main. Do not remove compare-and-swap, substitute revision 0 or silently send an unconditional edit to hide the schema error.

`086_task_edit_revision.sql` adds an integer revision with default 0, a nonnegative constraint and a trigger that advances it on every insert/update. The isolated schema and task-editing suites verify stale-save rejection, authorized saves, foreign/viewer denial and preservation of other fields. This does not establish that the migration has been applied to Cloud.

## Concrete repair sequence for review

1. Confirm the intended project and recoverable backup with the owner. Read the existing [runbook](../release-runbook.md) and [migration guidance](../../src/db/migrations/README.md).
2. Run [check_task_edit_revision.sql](../../src/db/migrations/check_task_edit_revision.sql) using read-only access. It reports the column, trigger, function and private schema without changing data.
3. Compare the real schema against the registry and all missing entries. Establish whether `private` and the relevant objects/grants already exist. Do not mark a migration applied from a table-name match alone.
4. Review the exact existing [086 migration](../../src/db/migrations/086_task_edit_revision.sql), its prerequisites, lock impact and recovery plan. Obtain explicit production approval before applying any SQL or backfilling registry checksums. This PR does neither.
5. Apply only the reviewed repair plan; preserve original migration checksums. If an object already exists, reconcile it rather than blindly rerunning the file.
6. Rerun the read-only diagnostics, then test two independent sessions editing the same disposable task: first save succeeds, stale save refuses while preserving the draft, reload allows a fresh edit. Verify an unauthorized user still cannot edit it. Confirm the trigger also advances revisions for API/MCP writes.

## Safer reporting tools

Previously `--status` and `--dry-run` called `CREATE TABLE IF NOT EXISTS guidon_migrations` before reporting. They now use a read-only transaction, probe for the registry and report all files pending if absent. They never bootstrap schema in reporting mode and still reject changed migration checksums.

`npm run test:migrations` invokes the real CLI against disposable PostgreSQL via PGlite with read-only transactions enforced. Six regressions cover both reporting flags, present/absent registries and checksum drift. No live connection or production credentials are used by those tests.

No live migrations, registry mutations, paid plan changes or application deployments were performed in this pass.
