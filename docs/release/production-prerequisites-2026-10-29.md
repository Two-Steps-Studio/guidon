# Production prerequisites - 2026-10-29

Historical preflight below. The later owner-approved schema repair is completed and verified in [Cloud migration reconciliation](./cloud-migration-reconciliation-2026-10-29.md#approved-production-execution); the original missing-revision finding is no longer current.

Related Guidon tasks: `f141afb1-c8cb-4fa1-a673-6caa66fc47bf` and `f3bdc95c-1b04-41b7-8418-04c59ab99631`.

## Read-only findings

- Supabase REST request selecting `tasks.revision` with `limit=0` returned HTTP 400, PostgreSQL error `42703`: column does not exist. No task contents were fetched and no task was changed.
- The migration registry's newest entry is `055_project_modules.sql`. This confirms the earlier history discrepancy, not that every later migration is missing. Later features can have been applied manually.
- Public production `/api/health` returned 200: web, database and storage OK, password auth advertised; billing not configured. A healthy connection does not establish complete schema or working email delivery.
- The Google local callback and session were verified separately; production frontend provider enablement is still unverified. GitHub awaits owner 2FA.
- Production Resend sender/key, Sentry alert delivery, uptime notification delivery and backup recovery have not been independently verified in this pass. Do not infer them from local environment files or a 200 health response.

## Task description editing

Additional read-only SQL inspection confirmed: `private_schema_present=true`, `revision_function_present=false`, `revision_column_present=false`, `revision_trigger_present=false`. The Supabase backups page reports that the Free Plan does not include scheduled project backups. An external/manual backup has not been confirmed; no upgrade was purchased. Establish a recoverable backup before approving a production repair.

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

`npm run test:migrations` invokes the real CLI against disposable PostgreSQL via PGlite with read-only transactions enforced. Twelve regressions cover both reporting flags, present/absent registries, historical LF/CRLF checksums and actual SQL drift. No live connection or production credentials are used by those tests.

## Registry reconciliation follow-up

A read-only registry comparison found 56 recorded files (000-055) and 47 unrecorded files in this checkout (057-103; 056 belongs to a separate branch). All 56 historical checksums match the current file bytes or their LF/CRLF encoding: 16 exact, 19 LF and 21 CRLF. No substantive SQL mismatch was found by this comparison. This still does not establish the live state of unrecorded migrations.

The runner now accepts those exact newline encodings for existing checksums. It does not trim SQL, accept arbitrary content changes, rewrite history or reapply recorded files. New records retain the checksum of the bytes executed. The old verifier rejected two newline compatibility cases; all 12 reporting tests pass after the change. The live migration registry was not edited.

No live migrations, registry mutations, paid plan changes or application deployments were performed in this pass.
