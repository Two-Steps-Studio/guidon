# Authentication QA evidence - 2026-10-24

Existing QA task: `faf1537d-aed4-4a50-b2ab-f2d105c2db7e`.

Local evidence: clean install/migrations/production build and all expanded
scenarios pass Chromium, Firefox and WebKit in run `af4ddecb2427`, including
packaging canaries and cleanup. Auth suite and targeted ESLint pass. The fixture
viewer has organization member/project viewer roles, matching a real invitation;
a brand-new signup correctly reaches `/start`, rather than assuming the transient
dashboard URL has completed onboarding.

## Implemented checks

The existing disposable PostgreSQL/real production application runner now adds
signup, server rejection of weak/duplicate credentials, exact DB creation checks,
fresh login after signup, external redirect rejection, and owner/viewer rendering
boundaries. Existing anonymous/login/logout/private-project checks remain.

Expired signed payloads are delivered in browser cookies whose cookie expiry is
still in the future. This proves server validation, rather than browser removal.
Forged user identity with a mismatched signature and malformed cookies are denied.
Only the disposable AUTH_SECRET can sign these test fixtures; production credentials
are neither read nor used, and the real verifier is not mocked in the app.

## Product fixes

- Signup uses the same hydration readiness mechanism as login. Controlled fields
  and submit remain disabled until React can retain typed input, and during save.
  A script-blocked SSR browser check covers this behavior.
- The session verifier now rejects `exp === now` (previously only `exp < now`).
  A deterministic test imports the production module using Node's `react-server`
  package condition for the existing server-only marker. It tests the exact expiry
  boundary, signatures, malformed claims, tampering and secret rotation. The legacy
  mirrored test remains, but is not the sole evidence for this behavior.

## Deliberate gaps

The direct-Postgres product intentionally does not offer email password recovery:
forgot/reset-password pages redirect to login. The new E2E asserts that supported
behavior; it does **not** claim successful email reset or recovery-token testing.

The Cloud path still requires an isolated Supabase Auth/PostgREST test project
and safe email sink for signup confirmation, valid/expired/reused recovery links,
reset/update and sessions. Third-party OAuth needs provider staging or a safe
protocol fixture. These are required remaining QA evidence, not grounds to mark
the original authentication card Done. Existing OAuth unit/protocol suites pass
but do not prove a deployed provider round trip. No real emails are sent by E2E.
The [staging handoff](./staging-handoff.md) lists the required environment and
explicitly separates the Cloud runtime from the migration process.

Viewer UI checks complement the existing DB/RLS suite; they do not claim complete
API/MCP mutation authorization coverage. No production deployment was performed.
