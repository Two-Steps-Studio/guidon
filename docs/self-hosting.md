# Self-hosting

Self-hosting is a first-class deployment mode for Guidon, not an
afterthought (TODO.md §1). This is the complete walkthrough. For what each
environment variable does, see [configuration.md](./configuration.md); this
page is about the deployment mechanics.

## Read this first: current state

Guidon's self-hosting work has shipped a real Docker deployment, a real
migration runner, and a real PostgreSQL-compatibility layer for the schema's
70 Row-Level-Security policies — all independently verified
(`npm run test:db`). What it has **not** shipped yet is the wiring that
would let the running application actually authenticate users and read/write
data through that self-hosted PostgreSQL instead of through Supabase.

Concretely, as of today:

- **Storage** is genuinely pluggable — `STORAGE_PROVIDER=local` works,
  fully decoupled from Supabase.
- **AI** is genuinely pluggable — `AI_PROVIDER=ollama` (or any of the other
  five backends) works for the one thing AI currently does, which is get
  constructed and health-checked. No feature calls it yet (see
  [configuration.md](./configuration.md#ai-todomd-67)).
- **Authentication and data access are not yet pluggable.** `src/proxy.ts`
  (route protection), `src/lib/data/current-user.ts` (the signed-in user),
  every organization/project access check, every Server Action, and the
  admin panel all go through the Supabase client. They require
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to be set
  and reachable — even when `DATABASE_URL` also points at a fully migrated,
  working self-hosted PostgreSQL. `DATABASE_URL` today is consumed by the
  migration runner and by an internal compatibility layer
  (`src/lib/db/session.ts`, `src/lib/db/pool.ts`) that is tested in
  isolation but has no callers anywhere else in the app.

So: you can self-host your files and (soon) your AI backend. You cannot yet
self-host your identity provider or your primary database in the sense of
"no Supabase account required" — a Supabase project (their cloud, or one you
run yourself) is currently a hard requirement for sign-in and data on every
path below, Docker Compose included. This is the accurate, current state,
not the end goal — track further progress in
`docs/self-hosting-audit.md`.

Everything below still stands: it's real infrastructure, correctly
documented, just not the full "point Guidon at your own Postgres and forget
Supabase exists" outcome yet.

## Which path do I want?

| | Cloud | Self-hosted (this page) | Development |
|---|---|---|---|
| Where it runs | Guidon Cloud infrastructure | Your server, via Docker Compose or bare Node | Your machine, `npm run dev` |
| Database | Supabase, managed | Supabase project required today (see above); `DATABASE_URL` also set up and migrated, ready for when the app is wired to it | Supabase project |
| Storage | Supabase Storage | `local` (filesystem) or `supabase` | Either |
| AI | Optional, any provider | Optional, `ollama` for a fully local backend | Optional |
| You run | Nothing | `db` + `migrate` + `app` containers, or your own Postgres + Node | `npm run dev` |

If you're evaluating Guidon or just want it running: use Cloud. If you're
deploying it on infrastructure you control: this page. If you're changing
Guidon's code: see the Development section in the root
[README.md](../README.md).

## Prerequisites

- Docker and Docker Compose (Compose path), **or** Node.js 22 and a
  PostgreSQL 17+ server you control (bare-metal path)
- A Supabase project (see the callout above — currently required regardless
  of path)
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
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — needed as
  Docker **build args** (baked into the client bundle at build time — see
  `next.config.ts`'s standalone-output comment and the Dockerfile's `ARG`
  list) and `SUPABASE_SERVICE_ROLE_KEY` needed at **runtime** for the reasons
  in the callout above

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

Be aware this only covers the AI subsystem — per the current-state callout,
sign-in and data still depend on a reachable Supabase project today, so a
Guidon deployment is not yet fully air-gapped end to end even with
`AI_PROVIDER=ollama` and `STORAGE_PROVIDER=local` set.

### Admin panel access

Set `ADMIN_EMAILS` in `.env` to a comma-separated list of emails that should
be able to reach `/admin`. **This currently has no effect under
`docker compose up`** — `docker-compose.yml`'s `app` service does not list
`ADMIN_EMAILS` in its `environment:` block, so the value never reaches the
container. Until that's fixed, either:

- run the bare-metal path below (which does read `ADMIN_EMAILS` from the
  process environment directly), or
- add `ADMIN_EMAILS: ${ADMIN_EMAILS:-}` to the `app.environment` block in
  your own copy of `docker-compose.yml` before deploying.

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
project. See [auth-setup.md](./auth-setup.md) for the full walkthrough —
not repeated here. Set `NEXT_PUBLIC_AUTH_PROVIDERS=google,discord` (or
either alone) once configured; leaving it unset keeps the install
password-only, which is a valid default for a fresh instance.

## Related

- [configuration.md](./configuration.md) — every environment variable, in detail.
- [upgrading.md](./upgrading.md) — updating a running instance.
- [backups.md](./backups.md) — backing up a self-hosted instance.
- [architecture.md](./architecture.md) — why the system is shaped this way.
- `docs/self-hosting-audit.md` — the working log of what's done and what remains for full self-hosting.
