# Configuration

`.env.example` is the source of truth for every environment variable Guidon
reads. This file explains what each section means and how the pieces fit
together; if the two ever disagree, trust `.env.example` and treat this page
as stale.

Copy it to `.env.local` for development, or to `.env` for `docker compose`
(see [self-hosting.md](./self-hosting.md)):

```bash
cp .env.example .env.local
```

Only the **REQUIRED** section must be filled in. Everything else has a
working default or is optional.

---

## REQUIRED

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_APP_URL` | The URL the app is served from. Sent to the browser. |
| `NEXT_PUBLIC_APP_NAME` | Display name, sent to the browser. |
| `AUTH_SECRET` | Signs local-storage download URLs (`src/lib/storage/providers/local.ts`) and is reserved for signing sessions later. Generate with `openssl rand -hex 32`. |

`NEXT_PUBLIC_*` variables are compiled into the client bundle at **build**
time (see `next.config.ts` / `Dockerfile`), not read at container runtime —
that's why the Dockerfile takes them as build args.

---

## ADMIN (TODO.md §25)

| Variable | Meaning |
|---|---|
| `ADMIN_EMAILS` | Comma-separated emails allowed into `/admin`, matched case-insensitively. |

There is no admin role in the database — `src/lib/data/admin-access.ts`
checks the signed-in user's email against this list and nothing else.
Unset (the default) means `/admin` is unreachable by anyone, which is the
safe default: nobody becomes an instance admin just by being first to sign
in.

**Docker Compose note:** `docker-compose.yml`'s `app` service does not
currently list `ADMIN_EMAILS` in its `environment:` block. Setting it in
`.env` has no effect on a `docker compose up` deployment as shipped today —
the variable only reaches the app when it's exported directly to the
container (see [self-hosting.md](./self-hosting.md#admin-panel-access) for a
workaround). This is a real gap, not a documentation choice.

---

## SIGN-IN PROVIDERS

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_AUTH_PROVIDERS` | Comma-separated: `google`, `discord`, `tss`. Controls which OAuth buttons render. |

Only listed providers get a button (`src/lib/auth/oauth-providers.ts`), so an
install with nothing configured stays password-only instead of showing
buttons that fail on click. Leaving it unset is a valid, fully-functional
state.

- `google` / `discord` — require the corresponding provider enabled in your
  Supabase project. See [auth-setup.md](./auth-setup.md) for the full Google
  Cloud / Discord Developer Portal / Supabase steps — that guide is the
  authoritative source, not repeated here.
- `tss` — sign in with a Two Steps Studio account. It routes to `/auth/tss`,
  which **does not exist yet** (`docs/auth-setup.md` says so explicitly).
  Listing `tss` today gives users a button that leads nowhere. `tss` must
  never be the only entry regardless — self-hosted Guidon has to work with
  no TSS account and with TSS unreachable (TODO.md §1).

---

## DATABASE

Guidon can read/write through two different backends, and which one is
actually exercised by the running application differs from what it looks
like at a glance — see the callout at the end of this section.

### Cloud (Supabase)

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key — safe to ship to the browser, RLS is the actual boundary. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Bypasses RLS. Used for cross-tenant reads (admin panel) and `/api/health`'s database check. Never expose this to the client. |
| `SUPABASE_SESSION_EXPIRY` | Access-token lifetime hint, hours. Default `24`. |

### Self-hosted PostgreSQL

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db`. Talks to PostgreSQL directly instead of through Supabase's REST layer. |
| `DATABASE_POOL_MAX` | Max pooled connections. Default `10`. |

**What `DATABASE_URL` is actually used for today:** the migration runner
(`npm run migrate`, `npm run migrate:status`) and the standalone
`npm run test:db` suite, which exercises the RLS-compatibility layer
(`src/db/bootstrap/000_auth_compat.sql`, `src/lib/db/session.ts`,
`src/lib/db/pool.ts`) against a real PostgreSQL. That layer recreates
Supabase's `auth` schema, `auth.uid()`, and the `anon`/`authenticated`/
`service_role` roles the schema's 70 RLS policies depend on, and it passes
its own test suite. See `src/db/migrations/README.md` for the full
per-migration reference.

**What it does not yet do:** no page, Server Action, or admin-panel query in
this codebase currently calls `src/lib/db/session.ts`'s `withUser` /
`withServiceRole`, or reaches through `src/lib/db/pool.ts`'s connection
pool. Every request path — authentication (`src/proxy.ts`), the signed-in
user (`src/lib/data/current-user.ts`), organization/project access checks,
every Server Action, and the admin panel — reads through the Supabase
client (`src/lib/supabase.ts` / `src/lib/supabase-server.ts`), which
requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to
be set regardless of whether `DATABASE_URL` also points at a working,
migrated, self-hosted Postgres. Concretely: `/api/health`'s database check
calls `createServiceClient()` (Supabase), so it reports `database: down` on
an install that configures only `DATABASE_URL`, even though the schema
applied successfully.

In short: the self-hosted-Postgres data path is built, migrated, and
independently tested, but the application does not run on it yet. A Supabase
project (cloud, or one you run yourself) is currently required for sign-in
and data access on every deployment path, including Docker Compose. See
[architecture.md](./architecture.md#database) for more detail.

---

## STORAGE

| Variable | Meaning |
|---|---|
| `STORAGE_PROVIDER` | `supabase` (default) — managed bucket. `local` — filesystem under `STORAGE_PATH`, served via `/api/storage`. `s3` — interface-ready, not implemented; selecting it throws. |
| `STORAGE_PATH` | Only used when `STORAGE_PROVIDER=local`. Must be a persistent volume in Docker or uploads vanish on container restart. |
| `STORAGE_SIGNING_SECRET` | Optional. Signs local-storage URLs instead of reusing `AUTH_SECRET`. |

Unlike the database, storage genuinely is decoupled today: uploads go
through the `StorageProvider` abstraction (`src/lib/storage/provider.ts`)
via a Server Action (`src/app/projects/[id]/files/actions.ts`), and both
`supabase` and `local` implementations exist and are wired in. `local`
resolves the signing secret as `AUTH_SECRET ?? STORAGE_SIGNING_SECRET`, so
in most setups `STORAGE_SIGNING_SECRET` doesn't need to be set separately.

---

## AI (TODO.md §6/§7)

Optional. Guidon runs fine with no AI provider configured — **nothing in the
app calls one yet**. `src/lib/ai/provider.ts` is the abstraction the first
concrete feature will build on; today it is only reachable through
`/api/health`, which constructs the configured provider (proving the config
is valid) but never calls `.complete()` against it. Leave `AI_PROVIDER`
unset to disable AI entirely — `/api/health` reports `ai: not_configured`,
a normal, expected state.

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `anthropic`, `openai`, `openrouter`, `ollama`, `azure-openai`, or `custom`. |
| `AI_MODEL` | Required for every provider except `azure-openai` (which uses `AZURE_OPENAI_DEPLOYMENT` instead). No default — a wrong guessed model name fails more confusingly than an explicit error. |
| `AI_BASE_URL` | Used by `ollama` and `custom` only. Ollama default is `http://localhost:11434` — its OpenAI-compatible surface is served under `/v1`, appended automatically, so set this to the plain host. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` | Per-provider keys. |
| `AI_API_KEY` | Only used when `AI_PROVIDER=custom` and the endpoint needs bearer-token auth. |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_API_KEY` | All four required together when `AI_PROVIDER=azure-openai`. Endpoint is the bare resource URL — the deployment path and `api-version` query param are added automatically. |

Provider notes:

- Five of the six backends (`openai`, `openrouter`, `ollama`,
  `azure-openai`, `custom`) speak the same OpenAI-compatible
  chat-completions shape; `openai`/`openrouter`/`ollama`/`custom` share one
  implementation file (`src/lib/ai/providers/openai-compatible.ts`),
  `azure-openai` gets its own file for its URL/auth conventions
  (`src/lib/ai/providers/azure-openai.ts`). `anthropic` has a genuinely
  different wire format and its own file (`src/lib/ai/providers/anthropic.ts`).
- `ollama` is the provider for a fully local install where no project data
  leaves the machine — no API key needed, just a reachable `AI_BASE_URL`.
- **Docker Compose note:** `docker-compose.yml`'s `app` service passes
  through `AI_PROVIDER`, `AI_BASE_URL`, and `AI_MODEL` but not the
  per-provider secret keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `OPENROUTER_API_KEY`, `AI_API_KEY`, `AZURE_OPENAI_*`). This means only
  `ollama` (no key required) currently works out of the box under
  `docker compose up`; a cloud AI provider would need the compose file's
  `app.environment` block extended with the relevant key. Since no feature
  calls `.complete()` yet, this has no user-visible effect today.

---

## INTEGRATIONS (not implemented yet)

| Variable | Meaning |
|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Commented out in `.env.example`. No GitHub integration code exists in this repo yet. |

---

## Related

- [self-hosting.md](./self-hosting.md) — how these variables come together for a self-hosted deployment.
- [architecture.md](./architecture.md) — why the provider abstractions and the compatibility layer exist.
- [auth-setup.md](./auth-setup.md) — Google/Discord OAuth setup steps.
- `src/db/migrations/README.md` — per-migration reference.
