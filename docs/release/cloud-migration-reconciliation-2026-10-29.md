# Cloud migration reconciliation and sign-in - 2026-10-29

Project: Guidon, `thtzaeeatjwyitifdcxb`. Production SQL changes require approval of the concrete plan below. This document does not authorize an application deployment.

## Verified preparation

- Direct session-pooler connection works with TLS certificate verification and the CA downloaded from the authenticated Supabase database settings page. Password stays in ignored `.env.migrations.local`; it is not added to the app's `DATABASE_URL`.
- A full custom-format PostgreSQL dump, including ACLs, exists outside the repository under `C:/Users/Marcin/.codex/backups/guidon/2026-10-29-before-migrations`. Its manifest contains size, SHA-256 and restore evidence. Storage file binaries are not in a PostgreSQL dump.
- The dump was restored into a fresh database in a local Supabase PostgreSQL 17 container with no network. All 88 original application/auth/storage table row counts matched. Production remained read-only during inspection and rehearsal.
- Registry: 56 records, 000-055. Repository: 103 migrations, 000-103 excluding 056 (separate branch). Historical checksum differences are exclusively LF/CRLF encoding; no SQL drift was found in those file checksums. This is not proof that every recorded historical constraint exists.

## Concrete proposed production operation

1. Recheck the backup manifest, current registry and inspected schema. Stop on unexpected changes.
2. Reconcile the 47 unrecorded repository files, 057-103, in filename order. Apply and record 45 files. For **079_custom_modules** and **085_agent_claims**, record verified existing objects without repeating their non-idempotent CREATE/ADD operations.
3. The two history-only decisions were checked against a clean repository reference: columns, constraints, indexes, triggers, function definitions and execution privileges, table RLS/access, and the custom-module column grants. Other older migrations are rerun where needed, rather than declared equivalent solely because their tables exist. For example, the real project-member SELECT policy still needs 069's correction.
4. Each operation uses its own transaction, a 5-second lock timeout and 120-second statement timeout. The migration and its registry insertion commit together. Existing 000-055 checksums are preserved. Stop at the first failure; earlier transactions remain committed and must be reported accurately.
5. Do not reset the database, drop user tables, run cleanup functions or deploy Vercel. Recheck schema, registry, RLS and the edit revision after applying.

The exact generated SQL for local review is `output/e2e/reviewed-migration-reconciliation.sql`; its hash and actions are in `output/e2e/reviewed-migration-plan.json`. Both are ignored operational artifacts. Source migration files remain unchanged.

## Rehearsal and data effects

The exact proposed SQL passed on a second fresh restore of production. Registry reached 103 entries. Under the real authenticated role on that copy, a fresh conditional task save succeeded and advanced revision, a stale save affected no rows, and a foreign identity could not save. All edit probes were rolled back.

The reviewed migrations add the missing task revision, feedback rating, event history, invitation format, module registry/automation tables, links, preferences, agent leases, approvals and briefs. Existing rows can receive documented backfills. Migration 091 cancels old pending invitations; the inspected database has **zero** such invitations. It also has zero public projects, zero tasks whose custom done flag differs from built-in status, and zero legacy content modules. One existing catalog version receives registry metadata/digest through 093. These are read-only preflight observations, not assumptions that should silently survive changed live data.

This updates the pending chain. It does not certify every object created before 055 as identical to the modern fresh-install schema; that older drift remains a separate audit scope.

## Sign-in configuration

- Google and GitHub both report enabled in the Supabase Auth settings endpoint and dashboard.
- The separate GitHub **Guidon Sign-in** OAuth app uses the exact Supabase callback; wildcard and device flow remain off. Its secret was transferred directly to Supabase. The repository integration app was not changed.
- With owner-approved `user:email`, GitHub completed the real callback into local Guidon, reached a protected profile, and retained the session on reload.
- Google was published with the owner's approval; its console now reports production status. This does not mean Google completed a separate branding verification, nor that Vercel has been deployed.
- Local provider buttons use `NEXT_PUBLIC_AUTH_PROVIDERS=google,github`. Production frontend enablement/build is a separate approved deployment step.

Validation: migration reporting tests **12/12**, including LF/CRLF compatibility and refusal of actual changed SQL; focused ESLint passed. Rehearsals used local copies, not production mutations.
