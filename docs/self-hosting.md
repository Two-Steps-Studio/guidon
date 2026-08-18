# Self-hosting

Self-hosting is a first-class deployment mode for Guidon, not an
afterthought (TODO.md §1). This is the complete walkthrough. For what each
environment variable does, see [configuration.md](./configuration.md); this
page is about the deployment mechanics.

## Read this first: current state

Guidon's self-hosting work has shipped a real Docker deployment, a real
migration runner, a real PostgreSQL-compatibility layer for the schema's 70
Row-Level-Security policies, and — as of this milestone — a real self-hosted
identity path. Sign-in no longer requires Supabase software to exist.

Concretely, as of today:

- **Storage** is genuinely pluggable — `STORAGE_PROVIDER=local` works,
  fully decoupled from Supabase.
- **AI** is genuinely pluggable — `AI_PROVIDER=ollama` (or any of the other
  five backends) works for the one thing AI currently does, which is get
  constructed and health-checked. No feature calls it yet (see
  [configuration.md](./configuration.md#ai-todomd-67)).
- **Authentication is genuinely pluggable.** When `DATABASE_URL` is set
  (self-hosted), `src/proxy.ts` (route protection), sign-up, sign-in,
  sign-out, and `src/lib/data/current-user.ts` (the signed-in user) all run
  against `auth.users` directly — email/password only, hashed with `scrypt`,
  sessions are a self-signed cookie (`src/lib/auth/local-auth.ts`,
  `src/lib/auth/session-cookie.ts`). No `NEXT_PUBLIC_SUPABASE_URL` reachable
  at runtime is required for this path. OAuth (Google/Discord) is not
  available in this mode — there is no GoTrue to redirect to, so the
  sign-in/sign-up pages hide those buttons automatically when self-hosted.
- **Data access is pluggable for exactly one page so far: the dashboard.**
  Its three queries run as SQL under `withUser()` instead of through the
  Supabase client, proving RLS applies identically either way. Every other
  page — organizations, projects, work, roadmap, knowledge, decisions,
  files, memory, context, settings, the admin panel — still calls the
  Supabase client unconditionally. Visiting one of those in a self-hosted
  install with no Supabase project configured at all will error, loudly, not
  silently: `createClient()` throws rather than returning something that
  looks like it worked.

So: you can now sign up, sign in, and see your dashboard on a plain
PostgreSQL with zero Supabase software running. You cannot yet use the rest
of the application that way — the remaining pages need the same
`supabase.from()` → SQL-under-`withUser()` conversion the dashboard already
got, one at a time, each verified against real RLS. That conversion work,
and how to add it, is tracked in `docs/self-hosting-audit.md`.

If you *do* configure a Supabase project alongside `DATABASE_URL` (i.e. you
don't mind Supabase existing, you just want your own Postgres), everything
below works today: sign-in and the dashboard use the local path, every other
page uses Supabase, and both point at data that's visible to the same user
because RLS is the same policies either way.

## Which path do I want?

| | Cloud | Self-hosted (this page) | Development |
|---|---|---|---|
| Where it runs | Guidon Cloud infrastructure | Your server, via Docker Compose or bare Node | Your machine, `npm run dev` |
| Database | Supabase, managed | `DATABASE_URL` — self-hosted PostgreSQL, no Supabase account needed for sign-in and the dashboard; a Supabase project is still needed for every other page until they're converted (see above) | Supabase project |
| Storage | Supabase Storage | `local` (filesystem) or `supabase` | Either |
| AI | Optional, any provider | Optional, `ollama` for a fully local backend | Optional |
| You run | Nothing | `db` + `migrate` + `app` containers, or your own Postgres + Node | `npm run dev` |
| Projects per organization | 1 (`src/lib/limits.ts`) | Unlimited | Unlimited |

If you're evaluating Guidon or just want it running: use Cloud. If you're
deploying it on infrastructure you control: this page. If you're changing
Guidon's code: see the Development section in the root
[README.md](../README.md).

**The 1-project-per-organization cap is specific to Cloud.** It's enforced
server-side (`isHostedProjectLimitReached()` in `src/lib/limits.ts`, checked
in `organizations/[id]/actions.ts`'s `createProject`, not just hidden in the
UI) and keyed off the same `hasDirectDatabase()` check as everything else in
this doc — self-hosted installs never hit it. Create additional
organizations to get more than one project on Cloud, or self-host for no
limit at all.

## Prerequisites

- Docker and Docker Compose (Compose path), **or** Node.js 22 and a
  PostgreSQL 17+ server you control (bare-metal path)
- A Supabase project — not needed to sign up, sign in, or use the dashboard
  (see the callout above), but still needed for every other page today
- `openssl` or any way to generate a random hex string, for `AUTH_SECRET`

## Docker Compose (primary path)

This is what `docker-compose.yml` actually supports: three services —
`db` (PostgreSQL 17, named volume, not exposed to the host), `migrate`
(one-shot, applies the schema and exits), and `app` (starts only after
`migrate` completes successfully and `db` is healthy).

```bash
cp .env.example .env
# fill in .env — see below for what's required
docker compose up -d
```

Required in `.env` for this to start:

- `POSTGRES_PASSWORD` — the compose file hard-fails without it
  (`POSTGRES_PASSWORD jest wymagane`)
- `AUTH_SECRET` — same, hard-fails without it
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Docker
  **build args** (baked into the client bundle — see `next.config.ts`'s
  standalone-output comment and the Dockerfile's `ARG` list), and
  `SUPABASE_SERVICE_ROLE_KEY` at **runtime** — required for every page except
  sign-up/sign-in/sign-out/dashboard, per the callout above. Leaving them
  unset gets you a working self-hosted identity and dashboard today; every
  other page will error until it's converted the same way.

What happens on `docker compose up -d`:

1. `db` starts and waits until `pg_isready` succeeds.
2. `migrate` runs `node scripts/migrate.mjs` against the `db` container. It
   detects `auth.uid()` is missing (a fresh Postgres, not Supabase) and
   applies `src/db/bootstrap/000_auth_compat.sql` first, then every
   migration under `src/db/migrations/`, then exits.
3. `app` starts only once `migrate` reports `service_completed_successfully`
   — the schema is never a step behind the code.

Verify with the health endpoint:

```bash
curl http://localhost:3000/api/health
```

`GET /api/health` (`src/app/api/health/route.ts`) reports `database`,
`storage`, `auth`, and `ai`, each `ok` / `degraded` / `down` /
`not_configured`, and never includes secrets. Given the current-state
callout above, expect `database: ok` only once Supabase is reachable (it
checks via `SUPABASE_SERVICE_ROLE_KEY`, not `DATABASE_URL`) — `DATABASE_URL`
having applied migrations successfully is not something this endpoint
reports on directly today.

### Choosing STORAGE_PROVIDER

`docker-compose.yml` defaults `STORAGE_PROVIDER` to `local` and mounts a
named volume (`guidon-storage:/app/storage`) so uploads survive a container
restart. This is the right default for self-hosting: files stay on your
infrastructure. Set `STORAGE_PROVIDER=supabase` in `.env` instead if you'd
rather use a Supabase Storage bucket (e.g. you're already relying on
Supabase for auth/data and want one less moving part).

### Choosing AI_PROVIDER for a local/offline install

TODO.md §17 describes an offline/air-gapped mode where the core application
works without external network access after installation, and every
external service — including AI — is optional. Set `AI_PROVIDER=ollama` and
point `AI_BASE_URL` at your Ollama daemon to keep AI fully local; leave
`AI_PROVIDER` unset to disable AI entirely (a normal, supported state, not a
degraded one).

Sign-in and the dashboard now work with zero external network access —
`DATABASE_URL` being set is what switches the app onto the local auth path,
per the current-state callout. The rest of the application still depends on a
reachable Supabase project until it's converted the same way, so a Guidon
deployment is not yet fully air-gapped end to end even with
`AI_PROVIDER=ollama` and `STORAGE_PROVIDER=local` set — but the sign-in wall
that used to block that goal outright is gone.

### Admin panel access

Set `ADMIN_EMAILS` in `.env` to a comma-separated list of emails that should
be able to reach `/admin`. `docker-compose.yml`'s `app` service forwards it
through, same as the bare-metal path. Leaving it unset (the default) keeps
`/admin` unreachable by anyone — the safe default, not a degraded state.

See [configuration.md](./configuration.md#admin-todomd-25) for what the admin panel
covers once reachable.

## Non-Docker path

`docker-compose.yml` is one option, not the only one. Against your own
PostgreSQL:

```bash
cp .env.example .env.local
# fill in .env.local, including DATABASE_URL pointing at your Postgres

npm run migrate:status   # see what would apply — changes nothing
npm run migrate          # apply the compat layer (if needed) + all migrations

npm run build
npm run start
```

`npm run start` runs the production Next.js server directly (no Docker,
no `output: "standalone"` bundling concerns — that flag only matters for the
Docker image's size). The same current-state caveat applies: `ADMIN_EMAILS`
and every other server-only variable in your `.env.local` reaches the
process normally here, since there's no compose layer in between.

## Auth providers

Google and Discord sign-in are supported once enabled in your Supabase
project — this requires Supabase, cloud or self-run, since it's GoTrue doing
the OAuth handshake. See [auth-setup.md](./auth-setup.md) for the full
walkthrough — not repeated here. Set
`NEXT_PUBLIC_AUTH_PROVIDERS=google,discord` (or either alone) once
configured; leaving it unset keeps the install password-only, which is a
valid default for a fresh instance.

**With `DATABASE_URL` set and no Supabase project configured at all**, OAuth
is not available — the sign-in and sign-up pages detect this and don't render
the buttons, rather than showing something that fails on click. Email and
password is the only sign-in method in that mode today.

## Related

- [configuration.md](./configuration.md) — every environment variable, in detail.
- [upgrading.md](./upgrading.md) — updating a running instance.
- [backups.md](./backups.md) — backing up a self-hosted instance.
- [architecture.md](./architecture.md) — why the system is shaped this way.
- `docs/self-hosting-audit.md` — the working log of what's done and what remains for full self-hosting.
