# REST/MCP isolation QA — 2026-10-24

Existing broad QA card: `f76a9572-8004-492f-b560-ab88e99fdde4`.

Local run `bbd7dd06dc84`: clean install/migrations/production build, packaging
canaries, 110 counted REST/MCP checks (including 60 sequential rate-limit samples),
expanded Chromium/Firefox/WebKit auth suite, log scan and cleanup all pass.
Targeted ESLint passes. These are not 110 distinct exploit classes or a pentest.

## Real integration evidence

The existing disposable production application suite now seeds tasks in both
tenant projects and separate keys for an owner, the other tenant, a read-only
scope, a project viewer, revoked/expired credentials, a report-project binding,
an allowed-origin constraint and a dedicated rate-limit case. Only key hashes
and display prefixes enter the disposable database; no production token is used.

Actual HTTP checks cover:

- Canonical issuer and authorization/token/registration endpoint origins from
  discovery, plus the bearer discovery challenge on unauthorized requests.
- Correct own project/task reads; the second tenant can access its own task.
- Cross-tenant task read/update/delete and project task-list denial in REST.
- Corresponding context/update/delete failures through registered MCP tools,
  with no foreign task/project name in results.
- Scope-based write rejection and viewer write/delete rejection; the database
  proves the original rows still exist with unchanged titles after denied calls.
- Missing, malformed, revoked and expired keys rejected by REST and MCP.
- Project-bound report keys refused general task/MCP access; required Origin
  denied when missing/wrong and accepted when matching exactly in REST.
- Successful own task create/update/delete in both REST and MCP, checked in DB.
- Sixty sequential allowed requests on a dedicated key, then REST 429 with zero
  remaining requests and MCP 429 using the same process's exhausted key.
- No raw fixture keys, password, invalid session fixture, DB password or signing
  secret in application logs. Browser traces contain disposable accounts only.

The runner asserts loopback origin, never accepts a user-supplied test target,
and runs these checks before the three-browser authentication/private-project
suite. All requests use the real route handlers, MCP SDK, guards and RLS.

## Coverage limits

This is additional evidence for the original card, not full completion. Cloud
Supabase/PostgREST custom-JWT behavior, the complete admin/developer/tester role
matrix, every Server Action, file upload/signed URL/export, token revocation
after membership changes, and full OAuth provider flows remain separate cases.
The existing database regression suite covers additional RLS paths but does not
substitute for those actual deployed workflows.

The rate limiter remains in memory per process: this check does not prove a
shared distributed limit across Vercel instances or multiple containers. That
requires a shared-store implementation and replica-level evidence. Metadata
checks do not replace the OAuth authorization/PKCE/issuer protocol tests.

The test performs destructive operations only on newly generated disposable
tasks in its own Docker database; foreign fixture tasks must remain intact.
No production endpoint, customer data, email or real payment is used. Remaining
Cloud staging requirements are in [the handoff](./staging-handoff.md).
