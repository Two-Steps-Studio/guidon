# Phase 4 — Subscriptions & Limits — design

## Context

Zero existing billing code (confirmed via grep for `stripe`/`subscription`/
`billing` across the codebase — nothing). One directly relevant existing
piece: `organizations.project_limit` (migration 014, built earlier this
session) — an admin-settable per-organization project cap, enforced in
`isHostedProjectLimitReached()` (`src/lib/limits.ts`), self-hosted installs
always exempt. This phase builds a real plan/subscription system around
that existing piece rather than replacing it.

No Stripe SDK, no Stripe credentials available in this environment — this
phase builds the schema and enforcement so Stripe Checkout/Customer Portal
can be wired in later with no schema changes (per the user's own framing:
"przygotuj system tak, żeby można było łatwo dodać Stripe" — prepare, not
integrate). Plan changes in this phase are **admin-only**, not a real
purchase flow — building a checkout UI that can't actually charge anyone
would be the "sztuczny paywall" the user explicitly said not to build.

## Plan tiers

Free = 2 projects (see below for why this changes from today's default of
1), Pro/Team/Business numbers as proposed by the user, prices in cents to
avoid float rounding:

| Plan | Price | Projects | Tasks/project | Storage | AI | GitHub | Analytics | Team roles | Audit logs | Priority support |
|---|---|---|---|---|---|---|---|---|---|---|
| Free | €0 | 2 | 50 | 500 MB | – | – | – | – | – | – |
| Pro | €8.99/mo | 10 | 1,000 | 10 GB | ✓ | ✓ | ✓ | – | – | – |
| Team | €19.99/mo | unlimited | 10,000 | 50 GB | ✓ | ✓ | ✓ | ✓ | – | – |
| Business | €49.99/mo | unlimited | unlimited | 200 GB | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Why Free becomes 2, not 1:** confirmed with the user directly — this
changes the default this session already shipped and documented in
`docs/self-hosting.md`. That doc gets updated as part of this phase.

Only project/task/storage limits are actually enforced by this phase —
they're the only real, existing features to gate. The boolean columns for
AI/GitHub/analytics/team-roles/audit-logs/priority-support are schema-level
placeholders future phases (AI Task API, Activity log, etc.) will read;
nothing reads them yet because those features don't exist yet either.

## Schema

New migration `015_subscriptions.sql`:

```sql
CREATE TABLE public.plans (
    id                      text PRIMARY KEY,
    name                    text NOT NULL,
    price_cents             integer NOT NULL CHECK (price_cents >= 0),
    project_limit           integer,          -- NULL = unlimited
    task_limit_per_project  integer,          -- NULL = unlimited
    storage_limit_bytes     bigint,           -- NULL = unlimited
    ai_request_limit        integer,          -- NULL = unlimited per period; also NULL when AI isn't offered at all
    has_ai_features         boolean NOT NULL DEFAULT false,
    has_github_integration  boolean NOT NULL DEFAULT false,
    has_advanced_analytics  boolean NOT NULL DEFAULT false,
    has_team_roles          boolean NOT NULL DEFAULT false,
    has_audit_logs          boolean NOT NULL DEFAULT false,
    has_priority_support    boolean NOT NULL DEFAULT false,
    stripe_price_id         text,             -- filled in when Stripe is actually wired
    sort_order              integer NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
    id                      uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id         uuid NOT NULL UNIQUE,
    plan_id                 text NOT NULL DEFAULT 'free',
    status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    stripe_customer_id      text,
    stripe_subscription_id  text,
    current_period_start    timestamptz NOT NULL DEFAULT now(),
    current_period_end      timestamptz,
    cancel_at_period_end    boolean NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);
```

FKs: `subscriptions.organization_id → organizations(id) ON DELETE CASCADE`,
`subscriptions.plan_id → plans(id)`.

Seed data (four rows, one per tier from the table above).

### New organizations get a Free subscription automatically

A new `AFTER INSERT ON organizations` trigger,
`private.handle_new_organization_subscription()`, inserts a `subscriptions`
row with `plan_id = 'free'` — same pattern as the existing
`on_organization_created` trigger that creates the owner membership,
added as a second, independent trigger rather than folded into the
existing function (isolated, easy to reason about on its own).

### `organizations.project_limit`'s new default

`ALTER TABLE organizations ALTER COLUMN project_limit SET DEFAULT 2;` —
matches the Free plan. Existing organizations' `project_limit` values are
NOT retroactively touched (an admin who already set a custom value keeps
it; organizations still on the old default of 1 stay at 1 until an admin
changes it or the org's plan changes — see below). This is a value-level
default change only, not a data migration, so it's safe and reversible.

`organizations.project_limit` remains the single source of truth for
project count (unchanged mechanism, unchanged RLS-column-grant protection
from migration 014) — task/storage limits are NOT given equivalent
`organizations` columns; enforcement reads them from
`subscriptions JOIN plans` directly (see below), since there's no existing
override mechanism for those two to preserve, and one source of truth is
simpler than keeping two in sync.

### RLS

`plans`: `SELECT` for `authenticated` (everyone can see what plans exist
and cost, for the pricing/billing page) — no `INSERT`/`UPDATE`/`DELETE`
policy for `authenticated` at all (plans are seed data, changed only via
migration or `service_role`).

`subscriptions`: `SELECT` for org members
(`private.is_org_member(organization_id)`, same helper every other
per-org table already uses) — no `INSERT`/`UPDATE`/`DELETE` policy for
`authenticated` at all. This mirrors the migration-014 lesson directly: if
`subscriptions` had an owner/admin-role `UPDATE` policy, an org owner could
upgrade their own plan for free by calling
`supabase.from('subscriptions').update(...)` themselves. Only
`service_role` (via the new admin action, see below) can write to this
table — there is no legitimate self-service write path in this phase.

## Enforcement

### Task limit per project

`src/app/projects/[id]/work/actions.ts`'s `createTask()`: before inserting,
on the hosted path only (self-hosted stays unlimited, matching every other
limit in this codebase), count the project's existing top-level tasks
(same `parent_task_id IS NULL` filter the dashboard stats already use —
subtasks don't count against the limit, matching how they're excluded from
every other task count in this codebase) and compare against the org's
plan's `task_limit_per_project`. A new shared helper,
`getOrgPlanLimits(organizationId)` in `src/lib/limits.ts` (extending the
existing file rather than creating a parallel one), returns
`{ projectLimit, taskLimitPerProject, storageLimitBytes, planName }` from
one `subscriptions JOIN plans` query. `isHostedProjectLimitReached` is
unchanged; a new `isTaskLimitReached(currentTaskCount, limit)` follows the
exact same shape (limit `null` = unlimited, same as today's `NULL` project
limit convention on `plans`).

### Storage limit per organization

`StorageProvider.usage(bucket, prefix)` already exists (used nowhere yet —
confirmed via grep). `src/lib/storage/storage.ts` gains
`getOrganizationStorageUsage(organizationId)`, summing usage across the
buckets an organization's files actually live in
(`STORAGE_BUCKETS.FILES`/`ATTACHMENTS`, prefixed by organization or project
IDs the org owns). Checked in the file-upload action
(`src/app/projects/[id]/files/actions.ts`) the same way task creation is
checked, against `storageLimitBytes` from `getOrgPlanLimits()`.

### Error message, not a crash

Every enforcement point returns the existing Server Action error-string
pattern already used everywhere in this codebase (`{ error: string }` /
`{ task: null, error: string }`) with a message ending in
"Upgrade your plan to raise this limit." — not a raw exception, matching
the user's explicit "nie pokazuj Something went wrong" requirement. The
UI layer (forms already render `state.error`) needs no new component for
this — the existing error-display pattern already renders it.

## UI

### `/organizations/[id]/billing` — new page

Server Component, gated by `requireOrgAccess()` (existing helper). Shows:
- Current plan name, price, and the four numeric limits with progress
  bars (reusing the `Card`/`Progress`-style pattern — this phase adds a
  `Progress` component via `npx shadcn@latest add progress`, the one
  piece of new UI infrastructure needed).
- A read-only comparison table of all four plans (from `plans`, ordered by
  `sort_order`), with the current plan visually marked.
- No purchase button — see "Context" above for why. A short note:
  "Contact your instance administrator to change your organization's
  plan."

### Entry point: a header button on the organization page, not the sidebar

Billing is organization-scoped, but `AppSidebar` (Phase 1b) has no concept
of "current organization" outside of a project context — only a project
switcher and project-scoped nav groups. Rather than build that concept
just for this one link, `organizations/[id]/page.tsx` gets a "Billing"
button in its header, following the exact same pattern as its existing
"Members" button (`<Link href={`/organizations/${orgId}/members`}>`).

### Admin: change an organization's plan

`src/app/admin/organizations/page.tsx`'s table gains a "Plan" column next
to the existing "Project limit" column, with a `<select>`-based inline
editor (`PlanEditor`, mirroring `ProjectLimitEditor`'s
`useTransition`-based pattern exactly). The new Server Action,
`updateOrganizationPlan(orgId, planId)` in
`src/app/admin/organizations/actions.ts` (same file as
`updateOrganizationProjectLimit`):
- `requireAdminAccess()` gate, same as every other admin action.
- Updates `subscriptions.plan_id` (and resets `current_period_start`/
  clears `cancel_at_period_end`) via `service_role`.
- **Also** updates `organizations.project_limit` to the new plan's
  `project_limit` — keeping the two in sync when an admin actually changes
  a plan, while leaving `project_limit` alone otherwise (an admin can still
  fine-tune it afterward with the existing `ProjectLimitEditor`, unaffected
  by this).
- `plans.project_limit = NULL` (unlimited) maps to a very large integer for
  the `organizations.project_limit` column (which has a `CHECK (project_limit >= 1)`
  and no NULL/unlimited concept) — `2147483647` (Postgres `integer` max),
  chosen as an explicit, greppable sentinel rather than silently picking an
  arbitrary large number with no meaning attached.

`AdminOrganizationRow`/`listOrganizationsForAdmin` (`src/lib/data/admin.ts`)
gains the joined `plan_id`/plan name, same dual-path (self-hosted SQL /
Supabase `.select()`) pattern as every other admin query in that file.

## Out of scope

- Actual Stripe Checkout/Customer Portal integration — no credentials
  available, and the user's own framing asked for "ready to add," not
  "added." The `stripe_customer_id`/`stripe_subscription_id`/
  `stripe_price_id` columns exist and are simply unpopulated (`NULL`) until
  a later phase wires the real Stripe SDK calls that would set them.
- Self-service plan upgrade/downgrade/cancel by an organization's own
  owner — admin-only for now, for the reason above.
- AI request limits being enforced anywhere — no AI feature exists yet
  (confirmed in Phase 1's investigation: "AI coupling: nie istnieje").
  The `ai_request_limit` column and `has_ai_features` flag exist on `plans`
  for the future AI Task API phase to read.
- GitHub integration, advanced analytics, team roles, audit logs, priority
  support as actual gated features — same reasoning, schema-only
  placeholders (`has_github_integration` etc.) for phases that don't exist
  yet.
- A public pricing page for anonymous (not-logged-in) visitors — the new
  billing page is inside the authenticated app, scoped to an organization
  a user already belongs to, matching where the user's own spec item 13
  ("pricing modal / page") is actually triggered from (a blocked-feature
  moment), not a marketing page.
- Usage tracking over time (`usage_records` as a historical ledger) — this
  phase computes usage live (`COUNT(*)` for tasks/projects,
  `StorageProvider.usage()` for storage) rather than maintaining a
  separate running-total table, since live computation is correct and
  simple for counts that are cheap to query today. A `usage_records` table
  becomes worth adding when a metric can't be computed live cheaply (e.g.
  AI requests over a rolling period) — deferred to the AI Task API phase,
  which is the first phase that actually needs it.
