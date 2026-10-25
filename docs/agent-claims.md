# Human-approved headless agent authentication

Guidon supports an opt-in `service_auth` claim ceremony from the WorkOS auth.md
profile. It complements browser OAuth and personal keys; it does not grant
anonymous project access or trust third-party identity assertions.

## Enable in staging first

1. Apply reviewed migration `085_agent_claims.sql` with this repository's existing
   migration runner. Verify the target/ledger before applying; do not replay
   unrelated migrations or use production as a test database. The migration
   creates two service-only RLS tables and invoker functions for atomic consent,
   polling and token issuance.
2. Generate a **separate** Ed25519 signing key in a private directory:

   ```bash
   node scripts/create-web-bot-auth-key.mjs .env.agent-auth.private.jwk AGENT_AUTH_PRIVATE_KEY
   ```

   Store the complete private JSON as the server-side secret
   `AGENT_AUTH_PRIVATE_KEY`. Never use a `NEXT_PUBLIC_` variable or reuse the
   outgoing Web Bot Auth key. Remove the local file securely. Keep its recovery
   and rotation under the operator's control; Windows directory ACLs still apply.
3. Deploy staging after the migration. This feature is disabled and absent from
   discovery until a valid active key is configured. A missing/invalid key
   does not relax existing OAuth issuer, PKCE, scope or client checks.
4. Check `/.well-known/oauth-authorization-server` advertises `service_auth`, the
   identity endpoint `/oauth/agent/identity`, JWT-bearer and claim grants, and the
   public JWKS URL `/.well-known/agent-auth-jwks.json`. The public key must not
   contain `d`. `/auth.md` and the docs MCP auth page explain the enabled flow.

## Agent and person workflow

- The agent registers a public DCR client using existing `/oauth/register`.
  Its name remains explicitly unverified. CIMD clients keep their existing
  signed-client/browser OAuth policy and cannot use this public-client ceremony.
- The agent posts JSON with `type: service_auth`, registered `client_id`,
  `login_hint` email and optional `scope`/`resource` to `/oauth/agent/identity`.
  Defaults are read-only `tasks:read project:read` and the product MCP resource.
- The response contains separate 256-bit machine/browser handles and a random
  six-digit code. The verification URI carries only the browser handle, not
  the code or machine secret. No credential is issued at this stage. The agent
  gives the intended person the verification URI and code.
- The person signs in through Guidon's normal authentication, enters the code,
  reviews the named client's requested scopes and consents. The account email
  must match the registration. Session identity is obtained again on submit;
  a submitted `user_id` or `email` cannot change it. Cancel does not require a code.
- The agent polls the existing `/oauth/token` with the profile claim grant and
  machine handle, at least five seconds apart. Earlier polling returns
  `slow_down` and increases the interval by five seconds, capped at 60 seconds.
  Pending means wait; denied/expired means stop. Successful claim exchange is
  one-time and returns a scoped access token plus a service-signed assertion.
- The claim window is ten minutes. After approval the assertion lasts up to
  24 hours, bounded by signing-key expiry; access tokens last at most one hour
  and never outlive the registration. Re-exchange the assertion with the
  JWT-bearer grant and the same resource until its expiry. This profile returns
  no refresh token. It is separate from OAuth `private_key_jwt` client authentication.

The public OAuth registration step is a Guidon requirement of this profile.
Only `service_auth` is advertised: anonymous `/claim` initialization, external
ID-JAG assertions and provider Security Event Tokens are not supported or
advertised. The standard OAuth authorization-code/refresh flows are preserved.

## Security and lifecycle

All handles, handoff codes and the email binding are stored as SHA-256 hashes.
Only service-role code can read/write the tables or invoke the functions.
Functions are `SECURITY INVOKER`, have fixed search paths and use locked rows;
registration locks use `NO KEY UPDATE`, compatible with audit foreign-key reads
during concurrent grant revocation, avoiding an inverted lock-order deadlock.
attempt counters, consent/grant creation, polling state and issuance cannot race
across server replicas. Five incorrect codes deny the pending request.

Signed assertions are verified against this service's configured Ed25519 key,
fixed algorithm/type/kid, exact issuer/audience, required timestamps, subject and
jti. They are deliberately reusable until expiry for refresh; opaque claim
handles are consumed once. No remote JWT key URL is trusted. Tokens bind to the
stored account, resource and scopes, remain `human_client=false`, and use normal
API authorization, tenant isolation and AI restrictions.

Profile → Connected apps lists the consent and can disconnect it, revoking its
access keys and blocking subsequent assertion exchanges. Revoking just an access
token through RFC 7009 affects that token; disconnect the grant to end the
delegation. Account/grant deletion cascades the related registrations.

The audit table records only registration UUID, event kind and time for start,
failed code, denial, approval, issuance and revocation. It contains no bearer
handles, code, email or JWT. Expired registrations and their events are removed
on a subsequent registration request once at least 24 hours past expiry. An
installation with no new requests retains them until operator cleanup. Existing
connected-app history has its separate lifecycle.

Identity initiation is limited to ten requests per IP per hour, token exchanges
to sixty per minute per IP, using the existing in-memory limiter. Those limits
are per process; use deployment-level abuse protection across replicas. Code
attempt and polling limits are persisted in the database. The identity JSON
body is capped at 16 KiB. Token, code and private-key values must not enter logs.

Key rollover currently uses one active key: replacing it invalidates outstanding
assertions from the old key. Existing access tokens remain subject to their own
expiry/revocation. Plan rotation and re-consent, test it in staging, and deploy
production configuration/migration only after explicit approval.

## Verification

`npm run test:agent-claims` runs cryptographic/state tests and the actual service,
server action and data adapter against an isolated PGlite PostgreSQL database.
It checks forged identity fields, private role boundaries, attempts, expiry,
scope/resource binding, concurrent single-use exchange and revocation. PGlite
uses one connection; concurrent statements are queued, while the row-locking
SQL is the production synchronization mechanism.

The release E2E suite runs real registration, browser login/consent, scope/tenant
checks, assertion exchange, disconnect and denial in Chromium, Firefox and
WebKit using disposable PostgreSQL and a fresh test-only signing key. It never
forwards a production key, charges a payment or creates an external account.

Protocol references: [WorkOS service guide](https://github.com/workos/auth.md/blob/main/agent-services/README.md),
[RFC 8628 interaction and polling security](https://www.rfc-editor.org/rfc/rfc8628.html),
[RFC 7523 JWT grants](https://www.rfc-editor.org/rfc/rfc7523.html).
