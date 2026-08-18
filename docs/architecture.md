# Architecture

A technical map of how Guidon is built, and why. For deployment mechanics
see [self-hosting.md](./self-hosting.md); for the environment-variable
surface see [configuration.md](./configuration.md); for the schema itself
see `src/db/migrations/README.md`.

## Request flow: Server Components + Server Actions

Guidon's pages read data as **Server Components** and write data through
**Server Actions** (`actions.ts` files colocated with each route, e.g.
`src/app/projects/[id]/actions.ts`, `src/app/organizations/actions.ts`).
This is deliberate, not incidental: an earlier architecture had the browser
talking to Supabase's PostgREST layer directly from `'use client'` pages,
which meant self-hosting would have required running PostgREST + GoTrue —
in practice, all of self-hosted Supabase, not "your own PostgreSQL." That
migration is done; only three pages remain client-side by necessity —
`auth/login`, `auth/signup`, `auth/logout` — because establishing a browser
session and redirecting to an OAuth provider are inherently browser-side
operations.

`src/proxy.ts` is Guidon's route-protection layer (Next.js's middleware
convention was renamed in the version this project pins — see the project's
own `AGENTS.md` note about tracking upstream API changes). It revalidates
the session on every request (`supabase.auth.getUser()`, not the
cookie-trusting `getSession()`) and redirects unauthenticated requests to
`/auth/login`.

## Database

Two backends exist in the code today, and they are not equally wired in.

**Supabase** (`src/lib/supabase.ts`, `src/lib/supabase-server.ts`) is what
every request path actually uses: `src/proxy.ts` for session checks,
`src/lib/data/current-user.ts` for the signed-in user, every
`src/lib/data/*-access.ts` module for org/project authorization, every
Server Action, and the admin panel (`src/lib/data/admin.ts`, via
`createServiceClient()`). Authorization here is enforced by **Row-Level
Security in PostgreSQL, not by application code** — 70 RLS policies applied
by the migrations, keyed off `auth.uid()`. That's the actual security
boundary: a Server Action or admin query that forgets a `WHERE` clause still
can't read another tenant's rows, because the database itself refuses.

**Self-hosted PostgreSQL** (`DATABASE_URL`, `src/lib/db/pool.ts`,
`src/lib/db/session.ts`) is a from-scratch reimplementation of the pieces
Supabase provides for free — the `auth` schema, `auth.users`, `auth.uid()`,
and the `anon`/`authenticated`/`service_role` roles — recreated as plain
PostgreSQL objects in `src/db/bootstrap/000_auth_compat.sql`, applied
automatically by the migration runner whenever it finds `auth.uid()`
missing. `src/lib/db/session.ts` is the application half: it opens a
transaction, sets `request.jwt.claims` via `set_config(..., true)` and does
`SET LOCAL ROLE`, so the same 70 RLS policies apply unchanged — one
definition of the security model instead of two that could drift. This is
verified by `npm run test:db` (49 assertions against a real PostgreSQL via
PGlite, no Docker, no Supabase).

**The gap, narrowing:** `src/lib/auth/local-auth.ts` (sign-up/sign-in via
`withServiceRole()`, writing straight to `auth.users`), `src/proxy.ts`
(route protection via a self-signed session cookie, no Supabase call), and
`src/lib/data/current-user.ts` (`withUser()`, reading the profile) all
branch on `hasDirectDatabase()` and use this layer for real when
`DATABASE_URL` is set. The dashboard (`src/app/dashboard/page.tsx`) is the
first data page converted the same way — its three queries run as SQL under
`withUser()` instead of `.from()`, proving RLS applies identically either
path.

Every other page — organizations, projects, work, roadmap, knowledge,
decisions, files, memory, context, settings, the admin panel — still talks
to Supabase unconditionally, regardless of `DATABASE_URL`. Converting each
one (replace `.from()` calls with SQL under `withUser()`/`withServiceRole()`,
verify against real RLS) is the remaining step, tracked in
`docs/self-hosting-audit.md`.

## Provider abstractions

Two provider interfaces exist for the same reason: self-hosting is a
requirement, not a hypothetical, so anything that would otherwise hard-code
a managed cloud service is behind an interface instead.

**Storage** (`src/lib/storage/provider.ts`) — `StorageProvider` defines
`ensureBucket`, `upload`, `download`, `remove`, `getUrl`, `usage`. Two
implementations exist: `providers/supabase.ts` (managed bucket) and
`providers/local.ts` (filesystem under `STORAGE_PATH`, served through
`GET /api/storage` with an HMAC-signed URL — nothing is statically served,
so an object can't be reached by guessing a path). `s3` is a recognized
provider name that throws "not implemented" rather than silently no-oping —
the interface is ready for it, the implementation isn't written. This one
actually is used end-to-end: file uploads go through a Server Action
(`src/app/projects/[id]/files/actions.ts`) specifically because `local`
needs to write to the server's disk, which the browser can't reach directly.

**AI** (`src/lib/ai/provider.ts`) — `AIProvider` defines one method,
`complete()`. Six backends: `anthropic` and `openai`/`openrouter`/`ollama`/
`azure-openai`/`custom` (five of which share one OpenAI-compatible-shape
implementation, `providers/openai-compatible.ts`; Azure gets its own file
for its URL/auth conventions; Anthropic gets its own file for its distinct
Messages API — no vendor SDKs are used, both are plain `fetch` calls). As of
today, **no feature in the app calls `.complete()`**. The only caller is
`checkAI()` in `src/lib/health/checks.ts`, which constructs the provider
(proving config validity) and stops there deliberately — an unauthenticated
container probe must never trigger a real, possibly-billed request to an
external vendor.

## Admin panel (TODO.md §25)

`src/app/admin/*` — five routes: the dashboard (`page.tsx`), `organizations`,
`users`, `logs`, `integrations`. Every route is gated by
`requireAdminAccess()` (`src/lib/data/admin-access.ts`), which checks the
signed-in user's email against the `ADMIN_EMAILS` allowlist — there is no
admin role in the database. All five routes are **read-only**: none contains
a Server Action, a form submission, or any other write path — they render
cross-tenant queries from `src/lib/data/admin.ts` (via
`createServiceClient()`, since "every organization" is definitionally a
cross-tenant read RLS is designed to prevent for anyone else) and the
`/api/health` checks for System Status.

## Health checks

`src/lib/health/checks.ts` holds the actual logic — `checkDatabase()`,
`checkStorage()`, `checkAI()`, `checkAuth()` — shared between
`GET /api/health` (the HTTP surface, unauthenticated so a container
orchestrator can probe it) and the admin panel's System Status section, so
the two never drift by reimplementing the same checks slightly differently.
Each check reports `ok` / `degraded` / `down` / `not_configured` and, on
failure, a short reason run through `safeReason()` — a scrubber that maps
raw driver errors to categories like `"unreachable"` or `"credentials
rejected"` specifically so connection strings, hosts, and keys never leak
into the response.

## `/api/v1`

A narrow, versioned surface for callers that are **not** the Guidon browser
client — currently just `GET /api/v1/search`
(`src/app/api/v1/search/route.ts`), used by the navigation search box
(`src/components/layout/navigation.tsx`). It used to hold 14 route handlers
mirroring CRUD the UI did client-side against PostgREST before the
Server-Components migration; 13 were deleted as dead code once every page
moved off them, per `src/app/api/v1/README.md`. The one remaining route
predates and survives that cleanup because it's genuinely used. Any new
route added here should be for a genuinely external caller — a webhook, a
bot, a future agent integration (TODO.md §16) — not a UI data path; UI reads
and writes belong in Server Components and `actions.ts` files, per the same
README.

## Related

- `src/db/migrations/README.md` — the schema itself, migration by migration.
- [configuration.md](./configuration.md) — every environment variable.
- [self-hosting.md](./self-hosting.md) — deployment mechanics and current gaps.
- `docs/self-hosting-audit.md` — the working log this page's "what's wired vs. what isn't" claims are drawn from.
