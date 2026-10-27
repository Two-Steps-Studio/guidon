# Security and tenant isolation — 2026-10-27

Guidon task `97feeeb4` ([Launch] security and tenant isolation). This pass adds
the module surfaces from migrations 092–094 and engine 1.3 to the existing
evidence ([REST/MCP isolation](./api-mcp-isolation-2026-10-24.md),
[webhooks](./webhook-qa-2026-10-25.md),
[authentication](./authentication-coverage-2026-10-24.md)).

All tests ran locally, on PostgreSQL 17 and fictitious tenants, against the
same code that CI runs. Nothing here touched production or Supabase Cloud.

This is not a pentest. It shows that the listed paths behave as stated. It is
not proof that no other paths exist.

## What was checked

| Area | Evidence | Result |
|---|---|---|
| RLS, all tables and policies | `test:db`: migrations 000–094 on PGlite, sections 1–78 | 741 pass |
| REST/MCP isolation and scopes | `tests/e2e/api-isolation.mjs` | 125 checks pass (was 110) |
| Module API/MCP, another tenant | the same suite, new checks | see below |
| Removed member | the same suite, new checks | see below |
| Signed file links | `tests/e2e/project-sections.mjs`: changed path, forged signature, replay as public, headers | pass |
| Webhook SSRF and signatures | `test:webhooks` | 86 + 12 pass |
| Authentication, OAuth, account deletion | `test:auth` | all files pass (169 checks) |
| `/api/v1` errors, limits, idempotency | `test:api` | 45 pass |
| Module registry, automations, sandbox | `test:modules` plus E2E `marketplace`, `module-automations`, `module-sandbox` | pass |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities |
| Secrets in the repository | pattern scan of tracked files: Stripe, AWS, GitHub, Slack and Resend keys, JWTs, private keys | none; only `.env.example` files are tracked |

New checks on the module surfaces:

- Another tenant's module returns 404 for list, details and run log.
- Configuring another tenant's module is refused, and the database confirms
  nothing changed.
- The MCP tools `list_modules`, `configure_module` and `list_module_runs` fail
  for another tenant's project.
- No response contains the other tenant's module name or entries.
- A read-only key and a project viewer can't configure a module.
- A member removed from the project and organization is cut off at once: the
  same API key gets 404 and no longer sees the project in `/api/v1/projects`.

## Fixed in this pass

- `GET …/modules/{id}/runs` returned 200 with an empty list for a project the
  caller can't see. Now it returns 404, like the other module routes. Nothing
  leaked: RLS already returned no rows.
- The module log and module configuration routes returned the database's own
  error text. They now return a generic message.
- Firefox E2E: the redirect from old content-module links is checked by where
  the page lands. Firefox reports that navigation as aborted
  (`NS_BINDING_ABORTED`).
- Engine 1.3 sandbox: model and tests are in [module-sandbox.md](../module-sandbox.md).

## Open findings (not blockers, ordered by priority)

1. **API rate limit is per instance.** Both `src/lib/api/rate-limit.ts` and
   `src/lib/auth/rate-limit.ts` keep counts in process memory. That matches the
   single-container setup in `docker-compose.yml`. Guidon Cloud runs on Vercel,
   though, where each instance counts separately, so the real limit is a
   multiple of 60/min.
   - Logins on Cloud are protected by Supabase Auth's own limits.
   - API keys are 256-bit random values, so this is about abuse and cost, not
     about guessing a key.
   - Fix: a shared counter, either a Postgres table or a KV store. It is a
     design decision and needs a migration.
2. **Database error text in older `/api/v1` routes.** About 10 routes return
   `error.message` with status 400: projects, tasks, references, events,
   priorities, columns, reports and `tasks/{id}`. That can reveal constraint
   and column names, not data.
   - Fix: map database errors to generic messages in `apiRoute`, in one place.
3. **Supabase Storage path not covered.** Signed links and headers were tested
   with the local storage provider only. On Cloud, files are served by
   Supabase Storage with its own policies, which these tests don't reach.

## Can't be verified from the repository

Supabase Cloud has no staging project (constraint from 2026-10-25), so these
remain open:

- the RLS catalogue actually deployed, and whether migrations 086–094 are applied;
- Cloud Auth settings: providers, JWT expiry, rate limits;
- Storage bucket policies;
- `MODULE_SIGNING_KEY`, `CRON_SECRET` and the Resend variables in Vercel;
- Sentry receiving events.

Before launch, the owner can export the policies from production with
`select schemaname, tablename, policyname, cmd, roles from pg_policies` and
compare them with `test:db` section 0 (counts) and the migrations.

## Deployment order for the module work

1. Migrations 093, then 094 (after 086–092).
2. Optional: `MODULE_SIGNING_KEY` (Ed25519 JWK, see `.env.example`).
3. `CRON_SECRET` is already used by `/api/cron/webhooks`, which now also
   retries automations.
