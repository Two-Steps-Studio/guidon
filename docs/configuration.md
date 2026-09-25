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
| `AUTH_SECRET` | Signs local-storage download URLs (`src/lib/storage/providers/local.ts`) and, on the self-hosted path, self-hosted auth's session cookies (`src/lib/auth/session-cookie.ts`). Generate with `openssl rand -hex 32`. |

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

**Docker Compose note:** `docker-compose.yml`'s `app` service forwards
`ADMIN_EMAILS` through to the container, same as the bare-metal path — see
[self-hosting.md](./self-hosting.md#admin-panel-access).

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

Guidon can read/write through two different backends, chosen per request by
`hasDirectDatabase()` — see the callout at the end of this section.

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

**What `DATABASE_URL` is used for:** every request path branches on
`hasDirectDatabase()` (`src/lib/db/pool.ts`, true iff `DATABASE_URL` is
set) and, when it's set, runs its query as plain SQL under
`src/lib/db/session.ts`'s `withUser()` / `withServiceRole()` instead of
going through the Supabase client. That covers authentication
(`src/proxy.ts`, `src/lib/auth/local-auth.ts`), the signed-in user
(`src/lib/data/current-user.ts`), organization/project access checks,
every Server Action, `/api/v1/search`, `/api/health`'s database check, and
the admin panel. `src/db/bootstrap/000_auth_compat.sql` recreates
Supabase's `auth` schema, `auth.uid()`, and the `anon`/`authenticated`/
`service_role` roles the schema's 70+ RLS policies depend on, so the same
policies apply unchanged whether a request went through PostgREST or a
direct `pg` connection. This is verified by `npm run test:db` against a
real PostgreSQL (PGlite, no Docker, no Supabase) and live against a
`docker compose up` stack with zero Supabase software running. See
`src/db/migrations/README.md` for the full per-migration reference and
[architecture.md](./architecture.md#database) for more detail.

In short: setting only `DATABASE_URL` (no Supabase project) is a fully
supported, independently-verified deployment path — this is what Docker
Compose self-hosting uses by default.

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

Optional. Guidon runs fine with no AI provider configured. `src/lib/ai/provider.ts`
is the abstraction two features build on today: the Memory page's "Generate
Insight" button and the Work board's AI task assistant (chat that turns a
description into proposed tasks) — both call `.complete()` and both simply
render "no AI provider configured" when `AI_PROVIDER` is unset. `/api/health`
also constructs the configured provider (proving the config is valid)
without spending a completion. Leave `AI_PROVIDER` unset to disable AI
entirely — `/api/health` reports `ai: not_configured`, a normal, expected
state.

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `anthropic`, `openai`, `openrouter`, `groq`, `ollama`, `azure-openai`, or `custom`. |
| `AI_MODEL` | Required for every provider except `azure-openai` (which uses `AZURE_OPENAI_DEPLOYMENT` instead). No default — a wrong guessed model name fails more confusingly than an explicit error. |
| `AI_BASE_URL` | Used by `ollama` and `custom` only. Ollama default is `http://localhost:11434` — its OpenAI-compatible surface is served under `/v1`, appended automatically, so set this to the plain host. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY` | Per-provider keys. |
| `AI_API_KEY` | Only used when `AI_PROVIDER=custom` and the endpoint needs bearer-token auth. |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_API_KEY` | All four required together when `AI_PROVIDER=azure-openai`. Endpoint is the bare resource URL — the deployment path and `api-version` query param are added automatically. |

Provider notes:

- Six of the seven backends (`openai`, `openrouter`, `groq`, `ollama`,
  `azure-openai`, `custom`) speak the same OpenAI-compatible
  chat-completions shape; `openai`/`openrouter`/`groq`/`ollama`/`custom`
  share one implementation file (`src/lib/ai/providers/openai-compatible.ts`),
  `azure-openai` gets its own file for its URL/auth conventions
  (`src/lib/ai/providers/azure-openai.ts`). `anthropic` has a genuinely
  different wire format and its own file (`src/lib/ai/providers/anthropic.ts`).
- `ollama` is the provider for a fully local install where no project data
  leaves the machine — no API key needed, just a reachable `AI_BASE_URL`.
- **Docker Compose:** `docker-compose.yml`'s `app` service passes through
  every one of the variables above (`AI_PROVIDER`/`AI_BASE_URL`/`AI_MODEL`
  plus all per-provider keys) — set them in `.env` and `docker compose up`
  picks them up for any provider, not just `ollama`.

---

## ERROR TRACKING

Optional, same "unset = fully inert" philosophy as AI above. `src/instrumentation.ts`
(server/edge) and `src/instrumentation-client.ts` (browser) only call
`Sentry.init()` when a DSN is present — an instance that never sets these
sends nothing to Sentry, or anywhere else. Server errors are still visible
in the container's own logs (`docker compose logs app`) either way; this is
for aggregation/alerting across many errors, not a replacement for that.

| Variable | Meaning |
|---|---|
| `SENTRY_DSN` | Server + edge runtime. Enables `src/instrumentation.ts`'s `register()`. |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser runtime. Build-time embedded like `NEXT_PUBLIC_SUPABASE_URL` — a Sentry DSN is meant to be public (it can only submit events, not read them). Usually the same value as `SENTRY_DSN`. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Optional, build-time only (not needed at runtime, so not in `docker-compose.yml`'s `app.environment`). Lets Sentry's build plugin upload source maps so stack traces show your actual source instead of minified output. Without them the build silently skips source map upload — `next.config.ts` passes `silent: true` so this doesn't print a warning on every build for the common case of not using them. |

---

## BILLING (Guidon Cloud only)

Optional, same philosophy again. `docs/superpowers/specs/2026-08-22-subscriptions-design.md`
built the plan/subscription schema and enforcement without Stripe (no
credentials were available at the time) — this is that later phase, once
real credentials exist. Self-hosted installs (`hasDirectDatabase()`) have no
plan limits at all (`src/lib/limits.ts` exempts them everywhere) and the
billing page shows a fixed "self-hosted" notice regardless of these
variables — billing is a Guidon Cloud concept, not something a self-hoster
needs.

| Variable | Meaning |
|---|---|
| `STRIPE_SECRET_KEY` | Enables `src/lib/billing/stripe.ts`'s `getStripe()`. Without it, `isBillingConfigured()` is false and the billing page's Upgrade/Manage billing buttons don't render — a read-only plan table, same as before this existed. |
| `STRIPE_WEBHOOK_SECRET` | Verifies the `Stripe-Signature` header on `POST /api/stripe/webhook` (`stripe.webhooks.constructEvent`). Get it from the Dashboard webhook endpoint you create for `<origin>/api/stripe/webhook`, subscribed to `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. |

**One-time setup after creating a Stripe account:** create a recurring Price
for each paid plan (Pro/Team/Business) in the Dashboard, then set that
Price's id on the matching row:

```sql
UPDATE plans SET stripe_price_id = 'price_...' WHERE id = 'pro';
UPDATE plans SET stripe_price_id = 'price_...' WHERE id = 'team';
UPDATE plans SET stripe_price_id = 'price_...' WHERE id = 'business';
```

No admin UI for this on purpose — a plan's Stripe Price is set once and
essentially never changes, so a full editor would be unused complexity.
`enterprise` (034) has no fixed price by design ("contact us") and is never
sold through Checkout. A plan with `stripe_price_id IS NULL` simply shows no
Upgrade button.

---

## INTEGRATIONS

| Variable | Meaning |
|---|---|
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG` | Optional. A GitHub **App** (not an OAuth App) used by the "Connect repository" button on a project's Files page - lets a project owner/admin link one GitHub repo per project and edit its code in-app (Monaco). Separate from `NEXT_PUBLIC_AUTH_PROVIDERS`: this authorizes repo access for an already-signed-in user, it is not a login provider. A GitHub App is required (rather than a classic OAuth App) so organizations work without a manual "Grant" step per org - an org owner installs the app once instead. Create it at `github.com/settings/apps/new` (or an org's equivalent) with Callback URL `<origin>/api/github/callback`, Setup URL `<origin>/api/github/setup`, repository permissions Contents (read & write) and Pull requests (read & write), and "Any account" install access if other people/orgs will use this Guidon instance. `GITHUB_APP_SLUG` is the app's URL slug (`github.com/apps/<slug>`). Without these set, the Files page behaves exactly as before (uploaded documents only). |
| `GITHUB_APP_WEBHOOK_SECRET` | Optional. Turns on **GitHub → task automation** for repositories connected with the App above. In the App's settings, activate the webhook with URL `<origin>/api/github/webhook` and this value as its secret, and subscribe to the **Push** and **Pull request** events (the permissions listed above already cover them). A commit, PR title/body or branch name that mentions a task as `guidon#<first 8 characters of its id>` (the task dialog and every editor plugin copy this) then comments on the task with a link and moves it: a commit starts it (Backlog/Todo → In Progress), an opened PR moves it to Review (a draft PR only to In Progress), and a PR merged into the repository's default branch moves it to Done. Changes are written as the person who connected the repository, labelled "GitHub", under RLS; a status is only changed into a column that's visible on the project's board. Unset: `/api/github/webhook` answers 503 and nothing happens. |

---

## Related

- [self-hosting.md](./self-hosting.md) — how these variables come together for a self-hosted deployment.
- [architecture.md](./architecture.md) — why the provider abstractions and the compatibility layer exist.
- [auth-setup.md](./auth-setup.md) — Google/Discord OAuth setup steps.
- `src/db/migrations/README.md` — per-migration reference.
