# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, AUTH_SECRET
npm run dev                  # dev server on :2137 (webpack, not Turbopack - see next.config.ts for why)
npm run build                # production build
npm run start                # start the production server (after build)
npm run lint                 # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit              # type-check without emitting

npm run migrate               # apply pending DB migrations (requires DATABASE_URL)
npm run migrate:status        # list applied/pending migrations, changes nothing
node scripts/migrate.mjs --dry-run   # show what would run, changes nothing

npm run test:db               # migration chain + RLS-compatibility layer against PGlite (real Postgres, no Docker/Supabase)
npm run test:ai                # AI provider factory's env-resolution logic, no live API key needed
npm run test:auth              # local-auth compatibility tests
npm run test:limits            # plan/limits logic tests
```

`test:db`/`test:ai`/`test:auth`/`test:limits` are plain Node scripts (`tests/db/compat.test.mjs`, etc.), not a test framework — there is no `--grep`/name filter; each run always executes the whole file. `test:db` is the primary regression safety net for anything schema- or RLS-adjacent (migrations, RLS policies, any Server Action that reads/writes through `withUser`) — run it after touching `src/db/migrations/**` or any permission-checking code, and expect the pass count printed at the end (currently 132) to stay the same or grow, never shrink.

There is no component/unit test runner (no Jest/Vitest/RTL) — UI changes are verified via `tsc` + `lint` + `build` plus a manual/browser pass, not automated tests.

## Architecture

### Dual-mode data layer — the one thing that touches almost every Server Action

Guidon runs against either a self-hosted Postgres or Supabase, decided once per request by `hasDirectDatabase()` (`src/lib/db/pool.ts`, true iff `DATABASE_URL` is set). Nearly every `actions.ts` file under `src/app/**` branches on it:

- **Self-hosted**: `withUser(userId, fn)` (`src/lib/db/session.ts`) runs `fn` inside a transaction with `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)` set to the caller's identity, so the same RLS policies that gate Supabase's PostgREST layer apply identically to a raw `pg` query here. Plain SQL, parameterized.
- **Hosted**: `createClient()` (RLS-enforced, cookie-scoped) or, rarely and deliberately, `createServiceClient()` (bypasses RLS — used only where the code comment says why, e.g. secrets access via a `SECURITY DEFINER` RPC).

Any new Server Action needs both branches, and both must enforce the same thing. When it's not obvious which mode is active in a given environment, `.env`/`.env.local` presence of `DATABASE_URL` is the tell (this repo's dev setup in some environments has neither DB URL and instead a Supabase project — check before assuming).

### RLS is the actual authorization boundary, not the app-level checks

`src/db/migrations/*.sql` defines 70+ RLS policies — that's the real access-control boundary. The permission helpers in `src/lib/data/{project-access,org-access,admin-access}.ts` (`canWriteProject`, `canManageProject`, etc.) exist for fast/readable rejection and better error messages, but are a second, looser layer on top of RLS, not a replacement for it. Two consequences that matter when reading or writing this code:

- An app-level permission check that looks "too loose" (e.g. missing a same-project cross-check on a foreign id) is often fine *by design* — RLS independently re-derives the real owning row/project via a subquery or trigger-set column and blocks it there. Read the actual RLS policy SQL for the table before concluding an app-level omission is a real bug.
- **A real, recurring bug class in this codebase**: a DELETE/UPDATE scoped only by a row's own `id` (not also by `project_id`), with no rowcount/`RETURNING` check afterward. If RLS silently blocks the write (policy doesn't match) or the `id` belongs to a different project entirely, Postgres returns success with zero rows affected — the action returns `{ error: null }`, the UI treats it as done, and (worse) an activity-log entry gets written for something that never happened. The fix, applied throughout `src/app/**/actions.ts`, is: scope every mutation by `id AND project_id`, and check `result.rows.length`/`.select().length` before treating it as success.

### Task/board vocabulary

`TaskStatus` (`src/types/task.ts`): `backlog | todo | in_progress | ai_working | review | done`. Board columns are project-configurable (migration 020) — `src/lib/work/task-board.ts`'s `BOARD_COLUMNS` is the default set; a resolved `columns` prop threads through the work UI so a hidden/relabeled column stays consistent everywhere it's rendered. Subtasks (migration 010) are plain rows in `tasks` with `parent_task_id` set — they carry the same full `TaskStatus`, not a separate boolean, and go through the same `createSubtask`/`updateTask`/`deleteTask` actions as top-level tasks.

### Storage

`StorageProvider` (`src/lib/storage/provider.ts`) abstracts Supabase Storage vs. a local-filesystem provider served through `/api/storage` with HMAC-signed URLs (`src/lib/storage/providers/local.ts`); an S3 interface is reserved but unimplemented. Inline (non-download) serving is gated by a small, deliberate extension allowlist (`SAFE_INLINE_EXTENSION_TO_MIME` in `src/lib/storage/storage-constants.ts`) — raster images and PDF only. SVG is excluded on purpose (it can carry `<script>`); this is independent of public/private — the signature/RLS governs *authorization*, the extension whitelist governs whether an already-authorized response is safe to render directly rather than force-download.

### AI

`src/lib/ai/` is a pluggable `AIProvider` abstraction (six backends, including `ollama` for self-hosted). It's wired into real features, not just scaffolding: task chat (`src/app/projects/[id]/work/ai-chat-actions.ts`) and project-memory insight generation (`src/app/projects/[id]/memory/generate-insight-button.tsx`, `.../memory/actions.ts`). Rate limiting for both is an in-memory sliding window (`src/lib/ai/rate-limit-window.ts`) shared by `chat-rate-limit.ts`/`insight-rate-limit.ts` — an accepted per-process/non-distributed tradeoff for the current single-container deployment shape, not an oversight.

### Auth & access resolution

Supabase Auth (email/password, optional Google/Discord OAuth). Per-request identity/role resolution lives in `src/lib/data/`: `current-user.ts` → `org-access.ts` (organization role) → `project-access.ts` (project role, derived from org membership + `project_members`). `src/proxy.ts` is Next's middleware (renamed upstream in this Next.js version — see `AGENTS.md`) and gates which routes require a session; machine-consumed routes (`/robots.txt`, `/sitemap.xml`, `/api/health`) must stay in its public-route allowlist or they silently redirect to login and break crawlability.

### Project structure

See `README.md`'s "Project structure" tree for the directory layout — it stays accurate at the file/folder level. Not accurate in that same README: the "self-hosted Postgres isn't used by the running app yet" and "AI abstraction not yet called by any feature" claims are stale — both are actively used as described above (confirmed via `hasDirectDatabase()` call sites across 47 files under `src/app/**`, and the AI call sites listed above).

### Migrations

`src/db/migrations/000_baseline_schema.sql` through the current numbered file, applied in order by `scripts/migrate.mjs`, each recorded with a checksum in `guidon_migrations` (a changed already-applied file is a hard error, never a silent skip). `src/db/migrations/README.md` is the authoritative per-migration reference — check it before assuming a table/column/policy's shape from memory. `src/db/bootstrap/000_auth_compat.sql` recreates `auth.uid()`/`auth.users`/roles on plain PostgreSQL so the same RLS policies work outside Supabase.
