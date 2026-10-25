# Agent registration verification — 2026-10-25

Baseline: `cb47a84` (main, PR #70 merged). This change implements the previously
missing human-approved `service_auth` profile; it does not assert a new production
orank score or claim that registry/account setup has been completed.

## Delivered

- Bounded public identity initiation for registered public DCR clients, with
  read-only default scopes, separate machine/browser secrets and a six-digit
  handoff code. No credentials before the intended account explicitly consents.
- Localized EN/PL/DE/ES consent screen, strict account/code/expiry checks, denial,
  persisted attempt/poll limits, atomic single-use claim consumption and signed
  assertion exchange. Existing project permissions and AI policy remain active.
- Exact-issuer/audience JWT verification against the service's own Ed25519 key.
  No third-party ID-JAG or anonymous support is advertised. Browser OAuth PKCE
  and signed CIMD-client authentication remain intact.
- Migration 085: service-only RLS tables and invoker functions, consent/grant
  creation and token storage in transactions, secret-free audit history, expiry
  cleanup. Connected apps reuses existing revocation controls.
- Opt-in metadata/auth.md/JWKS, separate server signing secret and deployment
  checker coverage. Missing configuration leaves this profile disabled.

## Evidence

`npm run test:agent-claims`: 11 cryptographic, PostgreSQL-state and actual
service/action/data-adapter tests pass. They cover forged identity fields,
nonmatching account, attempts, denial, expiry, resource/scope binding,
single-use claim exchange, JWT type/signature/issuer failures and revocation.

`npm run test:e2e` passed against a clean production build and disposable
PostgreSQL in Chromium, Firefox and WebKit. It includes 110 existing REST/MCP
isolation checks, normal auth/signup and release regression coverage, plus the
new browser approval flow. Evidence: local artifact run `857fe5cf994c` under
`output/e2e/` (results, app/build logs, screenshots and traces). These artifacts
contain only disposable test data and are not committed.

The new real-browser flow confirms no credential at registration; wrong-account
refusal; empty human code input; successful consent; read-only scopes; own-project
visibility and foreign-project/write refusal; one-use claim token; assertion
exchange; profile disconnect immediately refusing the old token and assertion;
and Cancel issuing no credential.

The PostgreSQL test uses separate connections to make issuance wait on a grant
while another transaction revokes it. Revocation completes without audit-FK
deadlock, issuance observes revocation, and no access key is created. Registration
`NO KEY UPDATE` locks and the revocation audit's `KEY SHARE` lock are compatible.
The polling fixture clears its statistics snapshot while waiting for the lock.

Existing auth/OAuth, agent-web discovery, readiness/key tests, TypeScript and
focused ESLint checks passed. The complete schema compatibility gate was updated
from 50 to 52 public tables to account for the two new service-only tables;
permissions for both are exercised separately in the new PostgreSQL tests.
The complete schema gate finished with **607 passed, 0 failed**.

## Still required

- Cloud/Supabase staging checks and deployment approval. Local evidence is for
  direct PostgreSQL; no production migration or configuration was changed.
- Apply migration 085 only after verifying the intended environment and ledger,
  then configure a separate `AGENT_AUTH_PRIVATE_KEY`. See [agent-claims.md](../agent-claims.md).
- npm/PyPI account creation and trusted publishing, plus publisher authorization
  for the MCP registry. See [registry-accounts-pl.md](registry-accounts-pl.md).
- Wikipedia/Wikidata eligibility, external profiles, public directory review and
  search ranking remain external dependencies. Preserve product authentication;
  do not invent identity/authority links or remove security to change the score.

There is no promise that this PR alone produces 100/100. Verify enabled staging
and then explicitly approved production behavior before requesting another scan.
