# Release, monitoring and rollback runbook

The order to follow when shipping Guidon, what to watch afterwards, and how to
go back. It covers Guidon Cloud (Vercel + Supabase) and self-hosted
installs. Commands that touch production are run by the operator, never by a
script or an agent on its own.

## 1. Before the release

- [ ] CI is green on the commit being released. That means `validate`,
      `application` (Chromium, Firefox, WebKit), `accessibility`, `mobile`
      and `restore-drill`.
- [ ] The new migrations are known. Run `npm run migrate:status` against
      the target, or check Supabase's migration history. Read each pending
      migration's entry in `src/db/migrations/README.md`.
- [ ] **A backup exists from right before the migration.**
  - Cloud: Supabase's daily backup or PITR covers the moment you are about
    to migrate (Dashboard → Database → Backups). Note the time.
  - Self-hosted: `pg_dump -Fc` plus the roles, as in
    [backups.md](./backups.md#restoring-onto-a-new-server).
- [ ] New environment variables are set in Vercel (or `.env`) before the
      deploy. Recent ones: `MODULE_SIGNING_KEY` (optional) and `CRON_SECRET`
      (already used by `/api/cron/webhooks`).
- [ ] Large migrations: check the timing with `npm run perf:large` on a
      copy if the migration touches `tasks`.

## 2. Release order

1. **Review and reconcile migrations before deploying dependent code.**
   `PENDING` means a file is absent from the runner's history; it does not
   prove that its schema objects are absent. Cloud history currently ends
   at 055 while some later objects already exist. Follow the concrete
   [production prerequisite review](release/production-prerequisites-2026-10-29.md)
   before applying SQL or recording checksums.
   - Cloud: compare the actual schema with each unrecorded file, review
     dependencies, lock impact, constraints, functions and old-client
     compatibility, then obtain operator approval for the exact plan.
     Apply only the genuinely missing, reviewed changes in dependency order
     and record the verified history. Additive intent alone does not
     guarantee an interruption-free migration.
   - Self-hosted: `npm run migrate`. Docker Compose does this on its own
     before `app` starts.
2. **Then the app.**
   - Cloud: `vercel.json` disables automatic production deploys from
     `main`, so the operator promotes the build.
   - Self-hosted: `docker compose up -d` with the new image.
3. **Check** (section 3) within 15 minutes.

## 3. After the release: what to check and what to watch

| Signal | Where | Healthy |
|---|---|---|
| `GET /api/health` | Uptime monitor every 1-5 min | `200`, `"status":"ok"`. Any required component down returns `503` with that component's `status` and `detail` |
| Server errors | Sentry (`SENTRY_DSN`), through `onRequestError` in `src/instrumentation.ts` | No new issue in 15 min |
| Browser errors | Sentry (`NEXT_PUBLIC_SENTRY_DSN`); errors caught by `error.tsx` and `global-error.tsx` are reported too | No new issue |
| Function logs | Vercel → Logs: filter on `[Stripe webhook]`, `[modules]`, `[webhooks]` | No repeating errors |
| Stripe webhook | Stripe Dashboard → Webhooks → endpoint | Deliveries `200`. A `500` is retried, and since PR #84 a retried event is processed again |
| Crons | Vercel → Cron Jobs: `/api/cron/webhooks` | Runs, `200` |

Alerts to set up once, as the operator:

- Uptime: `/api/health` not `200` twice in a row → notify.
- Sentry: a new issue, or an issue more than 10× in an hour → notify.
- Stripe: endpoint failure emails, which Stripe sends by default for
  repeated failures.

Smoke test by hand, about 3 minutes:

1. Log in.
2. Open a project board and create a task. Move it, then delete it.
3. Open Settings → Billing; the plan is shown.
4. Make one MCP or REST call with a test key.

## 4. Rollback

**The app (always the first step).**
- Cloud: Vercel → Deployments → the previous production deployment →
  *Instant Rollback* / *Promote*.
- Self-hosted: deploy the previous image tag.

Because migrations are additive, the previous version works on the
migrated schema. Rolling back the app is enough in almost every case.

**The schema.** Migrations are forward-only (`scripts/migrate.mjs` never
undoes anything). If a migration itself is the problem, use one of these:

1. **A compensating change** (preferred, no data loss). Write it as a new
   migration so the history stays truthful. Notes for the recent ones:

   | Migration | If it must be undone |
   |---|---|
   | 095 `list_project_tasks_page` in PL/pgSQL | Re-run the `CREATE OR REPLACE FUNCTION public.list_project_tasks_page` block from `072_api_idempotency_keys.sql`. Results are the same, only slower |
   | 094 module automations | The previous app ignores `module_automation_runs`. To stop the work: disable the modules' automations, or `UPDATE module_automation_runs SET status='failed' WHERE status='pending'` |
   | 093 module registry | The previous app ignores the registry tables. Installed packages keep working; `catalog_version` is just unused |
   | 092 content modules → packages | `projects.custom_modules` was kept as a copy, and an app from before 092 reads it again. Edits made after 092 exist only in `project_module_packages` |

2. **Restore the backup** taken before the migration. Everything written
   since then is lost.
   - Cloud: Supabase backup or PITR to the time noted in section 1.
   - Self-hosted: the procedure in
     [backups.md](./backups.md#restoring-onto-a-new-server), which
     `npm run test:restore` exercises in CI.

## 5. During an incident

1. Write down the time and what users see.
2. Check `/api/health`, Sentry and Vercel logs: is it one component or
   everything?
3. If it started with a release, roll back the app (section 4). That is
   fast and safe.
4. Database or Supabase down: check the Supabase status page and the
   project's own status. Don't restore a backup while the original might
   still come back.
5. Afterwards, write down the cause and the fix. Add a test that would have
   caught it.

## Not yet in place

- Status page and on-call tool: task `2c9153b7` (incident.io).
- Scheduled restore of a *real* backup onto a scratch server. The CI drill
  only proves the procedure on scratch data.
- A Supabase staging project for rehearsing Cloud migrations (constraint
  from 2026-10-25). Until it exists, `test:db` runs the whole migration
  chain on PGlite, RLS included, and `test:restore` runs it on
  PostgreSQL 17.
