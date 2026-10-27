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

## Optional design evidence collection

`node tests/e2e/run.mjs --design-audit` reuses the same disposable production
environment and safety guards, but collects route screenshots and DOM observations
instead of running the normal browser regression scenarios. It records
`evidence-collected`, never a blanket UX pass. Check the per-browser JSON for
navigation errors, JavaScript errors, redirect destinations and viewport sizes.
Small target/unnamed-control heuristics require manual review; they are not an
accessibility certification. Cloud/Stripe/device-only flows need separate fixtures.

The normal command without this flag retains existing regression behavior.

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
- BETA labels appear on the public site and signed-in header. Mobile feedback
  tests native rating keyboard controls, required score, actual Server Action
  rejection of a forged score, DB-failure retry with preserved input, persisted
  1/3/5 scores, rated/legacy admin display and non-admin denial. Only the fixture
  owner is allowlisted with an explicit test-only ADMIN_EMAILS value; inherited
  admin configuration is not used. INSERT is temporarily revoked/restored only
  in the runner's disposable database to prove the real error path.
- Small board scroll area ends below its longest column; a 40-card column keeps
  its own vertical scroll, horizontal board scrolling works, and the phone page
  does not overflow. Sidebar global/project/profile rows retain vertical centers
  when collapsing/expanding. Saved pins do not produce sidebar task links and
  remain intact in the database; each fixture mutation is restored afterward.

- Modules: content modules stored before migration 092 are converted by the
  real migration on PostgreSQL 17 and open in their own sidebar tab; a checkbox
  saves at once, an item is added in place, both survive a reload, the sibling
  module's data is untouched, the export holds manifest plus entries, old
  `/extensions/content/` links redirect, the viewer reads without edit
  controls or export, and another tenant sees nothing.
- Project sections (roadmap, decisions, knowledge, files): created through the
  real dialogs/upload with HTML/script payloads that stay text after reload and
  match the database; the knowledge link refuses `javascript:` on the server
  even with browser validation removed; a rejected save keeps what was typed;
  the file download link is signed and a changed path or signature is refused;
  the viewer has no create/upload controls and another tenant receives none of
  the content.

- Marketplace (Chromium only - the registry rules are server-side): one tenant
  publishes a public page module whose description carries a prompt-injection
  attempt; while pending it is neither listed nor served to others; the admin
  sees the finding and approves; the version is signed (a per-run
  MODULE_SIGNING_KEY) and listed; installation is refused by the server
  without consent and records the registry version; a report is filed; the
  author's dashboard shows one install and one report; a manifest changed in
  the database fails its signature and can't be installed; the admin cannot
  review their own submission; a rejection note reaches the author; an
  organization-only version is visible to an org member and not to another
  tenant; withdrawal removes the version and leaves the installation running.

- Module automations (Chromium): two entries added in the UI - only the
  matching one starts a run, which creates exactly one task (title from the
  entry, priority, author) and one notification; the Configuration log shows
  it and retries a failed run; REST lists modules without their records,
  refuses configuration and installation to the viewer and a partial
  permission approval, disables/configures a module and installs a catalog
  version (recording its registry version); MCP `list_modules` answers.

- Apple Design regression checks cover pointer/keyboard drag cancellation and
  confirmed moves, failed optimistic updates, retained unsaved drafts and files,
  dialog bounds at 320×480 with 200% text, crop feedback, image swipes and
  cancellation, semantic tabs, all calendar tasks and mobile agenda, AI IME and
  live log semantics, single-main landmarks, search failure/retry and response
  races, explicit date locales, notification failure/retry, and coarse-pointer
  target sizes. AI/search failure responses are local fixtures. These checks
  do not substitute for real device, assistive technology or performance trials.

This is the self-hosted direct-PostgreSQL auth/data path. It does **not** certify
Supabase Auth/PostgREST, external OAuth callbacks, reset email delivery,
complete onboarding, complete Kanban CRUD/concurrency, exhaustive API/MCP permissions,
Stripe, Supabase Storage uploads, mobile, accessibility or production monitoring. Those remain
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

`node tests/e2e/run.mjs --accessibility-audit` runs the axe/keyboard gate on the
same isolated clean build in all three browsers. `--with-accessibility` appends
it to the complete application regression. The gate retains violation and
incomplete-check JSON per browser; critical/serious WCAG findings fail without
rule/element exclusions. See `docs/release/accessibility-2026-10-25.md` for the
exact automated scope and the separate pending manual/Cloud checks.
