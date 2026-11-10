# Self-hosting

Self-hosting is a first-class deployment mode for Guidon, not an
afterthought (TODO.md §1). This is the complete walkthrough. For what each
environment variable does, see [configuration.md](./configuration.md); this
page is about the deployment mechanics.

## Server artifact configuration

Use `npm run build` for a distributable standalone build. Its postbuild guard
removes generated root `.env*` copies (Next otherwise copies loaded `.env` and
`.env.production` explicitly), and rejects unexpected runtime/tooling folders.
Running `next build` directly skips this packaging guard. Source configuration
files are never removed. Inject private configuration at runtime, for example
with Docker's existing `--env-file` / Compose `env_file`; do not distribute a
developer's `.next/standalone` before this guard succeeds. Public
`NEXT_PUBLIC_*` values are still build-time inputs and visible in browser assets.

Local storage is runtime data. Its root resolution is excluded from Turbopack
filesystem tracing, while bucket/path authorization checks remain active. Tracing
also excludes environment files, local storage, diagnostics and development
tooling as defense in depth. `STORAGE_PATH` must not equal the repository root;
use a dedicated persistent directory/volume. Existing Docker builds exclude
environment files from their build context and invoke the guarded build command.

`npm run test:package` covers output-path/symlink guards and source preservation.
`npm run test:e2e` proves non-secret configuration/data canaries do not ship and
then exercises the actual standalone application in three browsers.

## Read this first: current state

Guidon's self-hosting work has shipped a real Docker deployment, a real
migration runner, a real PostgreSQL-compatibility layer for the schema's 70
Row-Level-Security policies, and - as of this milestone - a real self-hosted
identity path. Sign-in no longer requires Supabase software to exist.

Concretely, as of today:

- **Storage** is genuinely pluggable - `STORAGE_PROVIDER=local` works,
  fully decoupled from Supabase.
- **AI** is genuinely pluggable - `AI_PROVIDER=ollama` (or any of the other
  six backends) powers the Work board's AI task chat and the Memory page's
  "Generate Insight" button (see
  [configuration.md](./configuration.md#ai-todomd-67)). Leave it unset to
  disable AI entirely, a normal, supported state.
- **Error tracking** is optional and off by default - set `SENTRY_DSN` (and
  `NEXT_PUBLIC_SENTRY_DSN` for the browser) to send errors to your own
  Sentry project; unset, nothing is sent anywhere and server errors are
  still visible in the container's own logs (see
  [configuration.md](./configuration.md#error-tracking)).
- **Authentication is genuinely pluggable.** When `DATABASE_URL` is set
  (self-hosted), `src/proxy.ts` (route protection), sign-up, sign-in,
  sign-out, and `src/lib/data/current-user.ts` (the signed-in user) all run
  against `auth.users` directly - email/password hashed with `scrypt`, plus
  optional Google/GitHub/Discord/GitLab/OIDC sign-in through Guidon's own
  OAuth client,
  sessions are a self-signed cookie (`src/lib/auth/local-auth.ts`,
  `src/lib/auth/session-cookie.ts`). No `NEXT_PUBLIC_SUPABASE_URL` reachable
  at runtime is required for this path. Supabase's own OAuth (GoTrue) isn't
  used here; the providers you configure for Guidon's client are shown
  instead, and none when none are set.
- **Data access is pluggable everywhere the UI and API reach.** Dashboard,
  organizations, projects, work (the kanban board), roadmap, knowledge,
  decisions, files, memory (including the FACT/AI INSIGHT review workflow),
  context (the relations graph and the task "Why" panel), settings,
  organization- and project-level member management, the admin panel, and
  `GET /api/v1/search` all run their queries as SQL under `withUser()`/
  `withServiceRole()` when `DATABASE_URL` is set - no Supabase client call
  anywhere in that path. Every one of those mirrors its Supabase-branch
  counterpart exactly: same RLS policies, same authorization checks, same
  triggers (a self-hosted `INSERT INTO organizations` fires
  `private.handle_new_organization()` the same way a PostgREST insert does -
  it's a plain Postgres trigger, not something Supabase-specific).
- **The health check reports self-hosted status honestly.** `checkDatabase()`
  and `checkAuth()` (`src/lib/health/checks.ts`, surfaced at `GET
  /api/health` and the admin panel's System Status) both check the
  self-hosted path first - a genuinely working self-hosted install no longer
  gets reported as `not_configured`/`down` just because no Supabase project
  exists.

So: you can sign up, sign in, create an organization, create a project, and
use the whole application - UI and the `/api/v1/search` surface alike - on a
plain PostgreSQL with zero Supabase software running, verified live against
a real `docker compose up` stack, not just by reading the code.

If you *do* configure a Supabase project alongside `DATABASE_URL` (i.e. you
don't mind Supabase existing, you just want your own Postgres), everything
below still works exactly as before: every page uses the local path, and
data stays consistent because RLS is the same policies either way - nothing
about adding the self-hosted path changed the Supabase path's behavior.

## Which path do I want?

| | Cloud | Self-hosted (this page) | Development |
|---|---|---|---|
| Where it runs | Guidon Cloud infrastructure | Your server, via Docker Compose or bare Node | Your machine, `npm run dev` |
| Database | Supabase, managed | `DATABASE_URL` - self-hosted PostgreSQL, no Supabase account needed | Supabase project |
| Storage | Supabase Storage | `local` (filesystem) or `supabase` | Either |
| AI | Optional, any provider | Optional, `ollama` for a fully local backend | Optional |
| You run | Nothing | `db` + `migrate` + `app` containers, or your own Postgres + Node | `npm run dev` |
| Projects per organization | 2 by default (Free plan), admin-adjustable per org (`src/lib/limits.ts`) | Unlimited | Unlimited |

If you're evaluating Guidon or just want it running: use Cloud. If you're
deploying it on infrastructure you control: this page. If you're changing
Guidon's code: see the Development section in the root
[README.md](../README.md).

**The project-per-organization cap is specific to Cloud.** Every
organization starts on the Free plan (2 projects, `plans`/`subscriptions`,
migration 015) and gets that limit written to its own
`organizations.project_limit` (migration 014) - the actual enforcement
still reads that column, not the plan directly. It's enforced server-side
(`isHostedProjectLimitReached()` in `src/lib/limits.ts`, checked in
`organizations/[id]/actions.ts`'s `createProject`, not just hidden in the
UI) and keyed off the same `hasDirectDatabase()` check as everything else in
this doc - self-hosted installs never hit it, and have no plans/billing at
all. An instance admin can raise a specific organization's limit either by
changing its plan or by directly adjusting `project_limit` from
`/admin/organizations`; otherwise, create additional organizations to get
more than one project on Cloud, or self-host for no limit at all. See
`/organizations/[id]/billing` for an organization's current plan and usage.

## Prerequisites

- Docker and Docker Compose (Compose path), **or** Node.js 22 and a
  PostgreSQL 17+ server you control (bare-metal path)
- A Supabase project - not needed at all (see the callout above)
- `openssl` or any way to generate a random hex string, for `AUTH_SECRET`

## Quick start (one command)

```bash
git clone https://github.com/two-steps-studio/guidon.git && cd guidon
./scripts/self-host.sh
```

On the first run it writes `.env` from `.env.example` with random
`POSTGRES_PASSWORD` and `AUTH_SECRET` and the self-hosted settings (local file
storage, no Supabase, `APP_URL` on port 3000 - set `APP_PORT=8080` or
`GUIDON_URL=https://guidon.example.com` in the environment to change them),
builds and starts the stack below, and waits until `/api/health` answers.
Your `.env` is kept on later runs. The same script looks after the instance:

| Command | What it does |
|---|---|
| `./scripts/self-host.sh update` | Backup, `git pull`, rebuild, migrate, restart ([upgrading.md](./upgrading.md)) |
| `./scripts/self-host.sh backup` | Database, roles, uploaded files and `.env` into `backups/<date>/` ([backups.md](./backups.md)) |
| `./scripts/self-host.sh restore backups/<date>` | Replace all data with a backup (asks first) |

Everything after this section is what the script does, for doing it by hand.

## Docker Compose (primary path)

This is what `docker-compose.yml` actually supports: three services -
`db` (PostgreSQL 17, named volume, not exposed to the host), `migrate`
(one-shot, applies the schema and exits), and `app` (starts only after
`migrate` completes successfully and `db` is healthy).

```bash
cp .env.example .env
# fill in .env - see below for what's required
docker compose up -d
```

`.env.example` is written for development: set `STORAGE_PROVIDER=local` (it
says `supabase`) and `APP_URL`/`NEXT_PUBLIC_APP_URL` to your real address (it
says port 5803), or uploads and links break. The quick-start script does both.

Required in `.env` for this to start:

- `POSTGRES_PASSWORD` - the compose file hard-fails without it
  (`POSTGRES_PASSWORD jest wymagane`)
- `AUTH_SECRET` - same, hard-fails without it
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` - **not required** at all with `DATABASE_URL`
  set (per the callout above)

What happens on `docker compose up -d`:

1. `db` starts and waits until `pg_isready` succeeds.
2. `migrate` runs `node scripts/migrate.mjs` against the `db` container. It
   detects `auth.uid()` is missing (a fresh Postgres, not Supabase) and
   applies `src/db/bootstrap/000_auth_compat.sql` first, then every
   migration under `src/db/migrations/`, then exits.
3. `app` starts only once `migrate` reports `service_completed_successfully`
   - the schema is never a step behind the code.

Verify with the health endpoint:

```bash
curl http://localhost:3000/api/health
```

`GET /api/health` (`src/app/api/health/route.ts`) reports `database`,
`storage`, `auth`, `ai`, and `billing`, each `ok` / `degraded` / `down` /
`not_configured`, and never includes secrets. `database` checks the
self-hosted path first (`hasDirectDatabase()` - a plain `SELECT 1` through
`withServiceRole()`), so `database: ok` reflects `DATABASE_URL` actually
working, not Supabase reachability; it only falls back to a Supabase check
when `DATABASE_URL` is unset.

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
external service - including AI - is optional. Set `AI_PROVIDER=ollama` and
point `AI_BASE_URL` at your Ollama daemon to keep AI fully local; leave
`AI_PROVIDER` unset to disable AI entirely (a normal, supported state, not a
degraded one).

Sign-in, the dashboard, and every other page and API route now work with
zero external network access - `DATABASE_URL` being set switches the whole
app onto the local auth and data-access path (see "Data access is pluggable
everywhere the UI and API reach" above), not just sign-in. With
`AI_PROVIDER=ollama` and `STORAGE_PROVIDER=local` (or unset entirely, since
both are optional), a Guidon deployment has no dependency on Supabase or any
other external service at all - genuinely air-gapped end to end.

### Admin panel access

Set `ADMIN_EMAILS` in `.env` to a comma-separated list of emails that should
be able to reach `/admin`. `docker-compose.yml`'s `app` service forwards it
through, same as the bare-metal path. Leaving it unset (the default) keeps
`/admin` unreachable by anyone - the safe default, not a degraded state.

See [configuration.md](./configuration.md#admin-todomd-25) for what the admin panel
covers once reachable.

## Non-Docker path

`docker-compose.yml` is one option, not the only one. Against your own
PostgreSQL:

```bash
cp .env.example .env.local
# fill in .env.local, including DATABASE_URL pointing at your Postgres

npm run migrate:status   # see what would apply - changes nothing
npm run migrate          # apply the compat layer (if needed) + all migrations

npm run build
npm run start
```

`npm run start` runs the production Next.js server directly (no Docker,
no `output: "standalone"` bundling concerns - that flag only matters for the
Docker image's size). The same current-state caveat applies: `ADMIN_EMAILS`
and every other server-only variable in your `.env.local` reaches the
process normally here, since there's no compose layer in between.

## Auth providers

Google and Discord sign-in are supported once enabled in your Supabase
project - this requires Supabase, cloud or self-run, since it's GoTrue doing
the OAuth handshake. See [auth-setup.md](./auth-setup.md) for the full
walkthrough - not repeated here. Set
`NEXT_PUBLIC_AUTH_PROVIDERS=google,discord` (or either alone) once
configured; leaving it unset keeps the install password-only, which is a
valid default for a fresh instance.

**With `DATABASE_URL` set and no Supabase project configured at all**, Guidon
uses its own OAuth/OpenID Connect client instead: Google, GitHub, Discord,
GitLab or any OIDC provider (Keycloak, Authentik, Entra ID...), configured in
`.env` with `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_OAUTH_CLIENT_ID/SECRET`,
`DISCORD_OAUTH_CLIENT_ID/SECRET`, `GITLAB_CLIENT_ID/SECRET` (+ `GITLAB_URL`)
or `OIDC_ISSUER` + `OIDC_CLIENT_ID/SECRET` (+ `OIDC_NAME`) - see
[configuration.md](./configuration.md#self-hosted-mode-database_url-set). Without any of them the install is
email and password only, and the sign-in page shows no provider buttons.

### Resetting a forgotten password

A self-hosted install sends no email, so password reset is done by whoever
runs the server:

```bash
docker compose exec app node scripts/reset-password.mjs user@example.com
```

It sets a new random password for that account and prints it once; hand it to
the person privately.

## Related

- [configuration.md](./configuration.md) - every environment variable, in detail.
- [upgrading.md](./upgrading.md) - updating a running instance.
- [backups.md](./backups.md) - backing up a self-hosted instance.
- [architecture.md](./architecture.md) - why the system is shaped this way.
- `docs/self-hosting-audit.md` - the working log of what's done and what remains for full self-hosting.
