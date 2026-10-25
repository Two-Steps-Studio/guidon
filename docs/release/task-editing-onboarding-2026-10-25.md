# Task editing and onboarding — 2026-10-25

Delivery: existing draft PR #72, `codex/board-completion`.
No production deployment, configuration change or live migration was performed.

## Preventing stale task overwrites

Previously, the full task dialog submitted a snapshot without checking whether
another editor had changed the task. The last save silently replaced newer data.

Migration `086_task_edit_revision.sql` adds a server-owned integer `revision`.
Every task insert starts at zero and every update increments it in a trigger,
including updates from API, MCP and service clients. A supplied revision cannot
reset the stored counter. Integer comparison avoids timestamp precision loss
between PostgreSQL, the direct database adapter and PostgREST.

The full edit dialog captures the revision with its initial form snapshot. Its
update matches project ID, task ID and that revision atomically, under existing
authorization and RLS. A stale, deleted or inaccessible row produces a generic
conflict without writing data or recording a successful-edit activity. Invalid
versions fail closed. Subtask title edits also use their original revision and
retain typed text on failure.

The losing editor can download their unsaved form as a local JSON file, cancel
a reload without losing text, or explicitly discard edits and reload the latest
task. This is a backup, not an automatic merge or import feature. Confirmed
document reload removes only this form's unload guard; ordinary closing and
cancelled navigation retain protection.

Existing authorized partial-action callers may omit the revision for backwards
compatibility. Their writes still increment the counter, invalidating older
full-form snapshots. This does not claim conditional writes across all external
clients. No permission or OAuth validation was relaxed.

## Migration and rollback boundary

Apply migration 086 through the repository's migration procedure before rolling
out the new full edit UI. Verify the migration ledger and task revision trigger
in staging. Older clients remain compatible with the additive schema change.
If the new UI encounters a task without a revision, it refuses the full save;
the person can download edits rather than overwrite data.

For application rollback, retain the additive column and trigger and roll back
the application separately. Dropping the column while this application is live
would break revision-matched saves. Take the normal database backup and review
the ALTER TABLE lock against the target workload before applying. Nothing here
executes SQL against a production database.

## Automated coverage

- `npm run test:task-editing` loads the actual server action, data adapter and
  SQL compiler against a fresh PGlite database with all migrations and RLS.
  It covers valid/stale writes, API-like revision tampering, invalid versions,
  foreign-tenant and viewer denial, preserved fields and conflict side effects.
- `npm run test:db` includes migration 086: 608 passed, zero failed.
- Browser coverage runs against a clean production build, disposable native
  PostgreSQL and loopback HTTPS, with external requests blocked. It exercises
  independent authenticated editing sessions, conflict recovery, local draft
  download, fresh saves, task CRUD, comments, subtasks, attachments, assignment,
  priority filters and persisted status changes.
- Onboarding coverage creates a real new account's organization and first
  project, checks owner memberships, first task persistence, repeated finish
  behavior, foreign-project isolation and adding an existing account as a
  project viewer. Viewer restrictions are checked in the actual UI.

Final clean-production-build run `77ed603f084c` passed in Chromium, Firefox and
WebKit, including the full onboarding/task scenarios above, existing module
and Apple Design regressions, 110 REST/MCP checks and 27 axe scans with zero
reported violations. Four incomplete accessibility checks per browser remain
manual review items. TypeScript, focused ESLint and E2E isolation guards passed.
Traces, videos, conflict screenshots and synthetic draft downloads are local in
`output/e2e/77ed603f084c/`; they are not committed. Failed exploratory runs remain
local evidence and are not reported as passes. WebKit regression coverage also
confirms that accepted reloads no longer trigger a second native unload prompt.

## Remaining acceptance criteria

The onboarding card remains partial: adding existing accounts is not an email
invitation and acceptance flow. The Cloud Free project cap also needs the
separate Supabase/Stripe staging environment; the self-hosted test intentionally
uses its unlimited mode. Follow [staging-handoff.md](staging-handoff.md).
Physical device and screen-reader checks remain separate manual release gates.

Related board cards:

- `d7b880f7-d561-4746-9998-1417995202fe` — Kanban and concurrent task edits.
- `0a88a2dd-5827-40fe-8f61-516039ad5a67` — onboarding, organization and first project.
