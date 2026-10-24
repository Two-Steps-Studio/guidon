# Real application release E2E

This suite uses the existing `playwright` dependency and production Next.js
server, not component adapters. Existing module fixture tests remain useful
and keep their own commands. No additional Playwright framework is introduced.

## Run

Requirements: Node 22/npm, Git, running Docker, OpenSSL and enough disk for a
fresh dependency install/build. Windows can use Git for Windows' OpenSSL at its
standard path; Linux CI uses its installed `openssl` binary.

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

No deployment URL, database URL, account, secret or production environment file
is supplied. The runner always creates its own uniquely named PostgreSQL 17
Docker container on a loopback-only random port. It copies Git-tracked and
non-ignored source files into a new OS temp directory, excludes `.env*`, builds
there with an allowlisted environment and applies the real migration runner.
It cannot be redirected to an existing database through `DATABASE_URL`.

Agent tooling directories (`.claude`, `.agents`, `.worktrees`) are excluded;
their Git symlinks can represent directories on Linux rather than Windows files.
The runner then creates explicitly non-secret packaging canaries in its own
temporary `.env.production`, default/custom storage and diagnostic output. It
asserts those never reach standalone output and source canaries stay intact.
No original environment file is copied or used.

Two tenant owners/private projects and a project viewer are seeded only in
that disposable database. Passwords, DB password, AUTH_SECRET and a one-day TLS
certificate are generated per run. HTTPS terminates at a loopback Node proxy;
the real production Secure/HttpOnly session cookie behavior stays enabled.
Accepting the temporary self-signed certificate is scoped to the test browser.
No OAuth issuer/session/security checks are disabled in application code.

The test app gets no inherited Stripe/Supabase service/provider/email keys or
NODE_OPTIONS. Its fetch guard refuses external origins; browser routing also
blocks requests outside the local test origin. npm installation/build can use
the network for dependencies, but browser tests do not contact live services.

## Current coverage

Before browser scenarios, real HTTP REST and MCP checks run once against two
tenant fixtures. Generated API keys are stored only as hashes in the disposable
database. Checks include canonical OAuth discovery/challenge, valid own reads,
foreign read/update/delete denial, read-scope and viewer write denial,
revoked/expired/report-bound keys, allowed origins, legitimate REST/MCP CRUD,
DB preservation after denied mutations, and a dedicated key's 60-request limit
shared across REST/MCP in this process. Traffic is sequential and restricted to
the runner's loopback app. Application logs are checked for fixture credentials.

Chromium, Firefox and WebKit run sequentially against the same built app:

- Anonymous protected-route redirect.
- Login controls stay disabled before hydration, so early input cannot be
  discarded by React initialization (regression first observed in WebKit).
- Bad-password rejection with no authenticated cookie.
- Real login and Secure/HttpOnly session cookie.
- Own project visible after navigation/reload; foreign private project absent
  from project list and dashboard.
- Direct foreign project request discloses no project title in HTML/RSC;
  own project request succeeds.
- Real logout and denial of the formerly authenticated protected route.
- Validly signed but expired session, forged identity with mismatched signature,
  and malformed cookie all denied by the application (browser expiry is future).
- Project owner receives their module editor; viewer can read the shared project
  without receiving the owner's editor and cannot see a foreign private project.
- Signup controls remain disabled before hydration. The actual signup Server
  Action rejects a weak password even when browser minlength is removed, and
  rejects duplicate accounts with no session. Rejected weak accounts do not exist
  in the disposable DB.
- New signup persists exactly one DB user, creates a Secure/HttpOnly session,
  rejects an external redirect target, and supports logout and a fresh login.
- In direct-Postgres mode, forgot/reset-password pages redirect to login as
  documented, instead of invoking Cloud recovery services.

This is the self-hosted direct-PostgreSQL auth/data path. It does **not** certify
Supabase Auth/PostgREST, external OAuth callbacks, reset email delivery,
complete onboarding, complete Kanban CRUD/concurrency, exhaustive API/MCP permissions,
Stripe, uploads, mobile, accessibility or production monitoring. Those remain
the separate QA cards and should extend this foundation.

## Failure evidence and safety

`output/e2e/<runId>/` retains install/migration/build/app logs, structured browser
results, traces and video; failed browser cases also save a screenshot. These
artifacts contain only disposable test accounts/passwords and fixtures. Do not
adapt the suite to real customer accounts or attach production recordings.

Run timeout: 12 minutes; CI allows 20 minutes so cleanup/artifact upload has
time. Server/proxy/DB connections close in `finally`. Only the exact container
name created by this run is removed. Temp deletion verifies that the resolved
path is an immediate `guidon-e2e-*` child of the OS temp directory. If the
process is forcibly killed, remove only that run's named test container and
temp directory after checking its identity; no broad Docker or volume prune.

The GitHub Actions workflow uses no repository secrets or production service.
Passing this suite is one release gate, not a declaration of launch readiness.
