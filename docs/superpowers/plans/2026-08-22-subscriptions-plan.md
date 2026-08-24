# Phase 4 Implementation Plan: Subscriptions & Limits

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real `plans`/`subscriptions` schema, task-per-project and storage-per-organization limits enforced server-side (Guidon Cloud only, self-hosted stays unlimited), a read-only billing page, and an admin-only plan changer.

**Architecture:** One migration creates `plans` (seeded, 4 tiers) and `subscriptions` (1:1 per org, auto-created on org creation via trigger, admin-write-only via RLS). `src/lib/limits.ts` gains `getOrgPlanLimits()`; enforcement is added at the two existing creation points that need it (`createTask`, file `uploadFile`). A new billing page and an extension to the existing admin organizations table cover the UI.

**Tech Stack:** PostgreSQL/PGlite (migration), Next.js Server Components/Actions, shadcn `progress` primitive.

Spec: `docs/superpowers/specs/2026-08-22-subscriptions-design.md`

---

### Task 1: Migration `015_subscriptions.sql`

**Files:**
- Create: `src/db/migrations/015_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- GUIDON — MIGRACJA 015
-- plans + subscriptions: Free/Pro/Team/Business (TODO §10-13)
-- ============================================================
--
-- Uruchomić PO 014.
--
-- POWÓD
-- -----
-- Zero istniejącego kodu billingowego (grep po "stripe"/"subscription"/
-- "billing" w całym repo — nic). Ta migracja dodaje realny schemat planów
-- i subskrypcji, budowany wokół istniejącego organizations.project_limit
-- (migracja 014), nie zamiast niego.
--
-- Free zmienia się z dzisiejszego project_limit DEFAULT 1 na 2 — patrz
-- docs/superpowers/specs/2026-08-22-subscriptions-design.md, potwierdzone
-- z użytkownikiem wprost. Istniejące organizacje NIE są retroaktywnie
-- dotykane — to zmiana DEFAULT dla nowych wierszy, nie migracja danych.
--
-- BEZPIECZEŃSTWO: subscriptions ma zero polityk INSERT/UPDATE/DELETE dla
-- authenticated — dokładnie ta sama lekcja co project_limit w 014: gdyby
-- właściciel organizacji mógł UPDATE własną subskrypcję, mógłby się sam
-- awansować na dowolny plan za darmo. Jedyna legalna ścieżka zapisu to
-- service_role (panel admina).
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.plans (
    id                      text        NOT NULL PRIMARY KEY,
    name                    text        NOT NULL,
    price_cents             integer     NOT NULL CHECK (price_cents >= 0),
    project_limit           integer,
    task_limit_per_project  integer,
    storage_limit_bytes     bigint,
    ai_request_limit        integer,
    has_ai_features         boolean     NOT NULL DEFAULT false,
    has_github_integration  boolean     NOT NULL DEFAULT false,
    has_advanced_analytics  boolean     NOT NULL DEFAULT false,
    has_team_roles          boolean     NOT NULL DEFAULT false,
    has_audit_logs          boolean     NOT NULL DEFAULT false,
    has_priority_support    boolean     NOT NULL DEFAULT false,
    stripe_price_id         text,
    sort_order              integer     NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now()
);


INSERT INTO public.plans (id, name, price_cents, project_limit, task_limit_per_project, storage_limit_bytes, ai_request_limit, has_ai_features, has_github_integration, has_advanced_analytics, has_team_roles, has_audit_logs, has_priority_support, sort_order)
VALUES
    ('free', 'Free', 0, 2, 50, 500 * 1024 * 1024, NULL, false, false, false, false, false, false, 0),
    ('pro', 'Pro', 899, 10, 1000, 10 * 1024 * 1024 * 1024, 500, true, true, true, false, false, false, 1),
    ('team', 'Team', 1999, NULL, 10000, 50 * 1024 * 1024 * 1024, 2000, true, true, true, true, false, false, 2),
    ('business', 'Business', 4999, NULL, NULL, 200 * 1024 * 1024 * 1024, NULL, true, true, true, true, true, true, 3)
ON CONFLICT (id) DO NOTHING;


CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id         uuid        NOT NULL UNIQUE,
    plan_id                 text        NOT NULL DEFAULT 'free',
    status                  text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    stripe_customer_id      text,
    stripe_subscription_id  text,
    current_period_start    timestamptz NOT NULL DEFAULT now(),
    current_period_end      timestamptz,
    cancel_at_period_end    boolean     NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);


ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_organization_id_fkey;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_organization_id_fkey
        FOREIGN KEY (organization_id)
            REFERENCES public.organizations(id)
            ON DELETE CASCADE;


ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_plan_id_fkey;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey
        FOREIGN KEY (plan_id)
            REFERENCES public.plans(id);


CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();


-- New organizations get a Free subscription automatically — same pattern
-- as on_organization_created (001) creating the owner membership, added
-- as a second, independent trigger.
CREATE FUNCTION private.handle_new_organization_subscription()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.subscriptions (organization_id, plan_id)
    VALUES (NEW.id, 'free');
    RETURN NEW;
END;
$$;


CREATE TRIGGER on_organization_created_subscription
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION private.handle_new_organization_subscription();


-- Free plan's project_limit, for organizations created from here on.
-- Existing organizations' values are NOT touched.
ALTER TABLE public.organizations ALTER COLUMN project_limit SET DEFAULT 2;


ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select
ON public.plans
FOR SELECT
TO authenticated
USING (true);


DROP POLICY IF EXISTS subscriptions_select ON public.subscriptions;
CREATE POLICY subscriptions_select
ON public.subscriptions
FOR SELECT
TO authenticated
USING (private.is_org_member(organization_id));


GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;


COMMIT;
```

- [ ] **Step 2: Add PGlite assertions**

In `tests/db/compat.test.mjs`, insert a new section right before the final
summary `console.log`, after section 14 (the project_limit grant test from
the earlier project-limit plan):

```javascript
// ------------------------------------------------------------------
section("15. plans + subscriptions (migracja 015)");

await withServiceRole(async () => {
  const { rows } = await db.query("SELECT id, project_limit FROM public.plans ORDER BY sort_order");
  check(
    "4 plany zaseedowane w kolejnosci",
    rows.length === 4 && rows.map((r) => r.id).join(",") === "free,pro,team,business",
    JSON.stringify(rows)
  );
});

await withUser(A, async () => {
  const org = await db.query(
    "INSERT INTO public.organizations (name, slug) VALUES ('Sub Test','sub-test') RETURNING id, project_limit"
  );
  check(
    "nowa organizacja dostaje project_limit=2 (Free)",
    org.rows[0].project_limit === 2,
    org.rows[0].project_limit
  );

  const sub = await db.query(
    "SELECT plan_id, status FROM public.subscriptions WHERE organization_id = $1",
    [org.rows[0].id]
  );
  check(
    "nowa organizacja dostaje subskrypcje Free automatycznie",
    sub.rows[0]?.plan_id === "free" && sub.rows[0]?.status === "active",
    JSON.stringify(sub.rows)
  );

  await expectRejected(
    "wlasciciel NIE moze sam zmienic swojego planu",
    () =>
      db.query("UPDATE public.subscriptions SET plan_id = 'business' WHERE organization_id = $1", [
        org.rows[0].id,
      ]),
    /permission denied/i
  );
});

await withServiceRole(async () => {
  const { rows } = await db.query("SELECT count(*)::int n FROM public.subscriptions");
  check("service_role widzi subskrypcje", rows[0].n >= 1, rows[0].n);
});
```

- [ ] **Step 3: Update the table/policy count assertions**

In `tests/db/compat.test.mjs` section 1, this migration adds 2 tables and
2 policies. Update the expected counts (currently `17` tables / `73`
policies):

```javascript
  ["19 tabel", "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'", 19],
  ["75 polityki RLS", "SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'", 75],
```

- [ ] **Step 4: Run the migration test**

Run: `npm run test:db`
Expected: all sections pass including the new section 15, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/015_subscriptions.sql tests/db/compat.test.mjs
git commit -m "Add plans/subscriptions schema with an admin-only write path"
```

---

### Task 2: `getOrgPlanLimits` and `isTaskLimitReached` in `src/lib/limits.ts`

**Files:**
- Modify: `src/lib/limits.ts`

- [ ] **Step 1: Add the plan-limits lookup**

Add to `src/lib/limits.ts` (after the existing project-limit exports):

```typescript
export interface OrgPlanLimits {
  planName: string;
  projectLimit: number | null;
  taskLimitPerProject: number | null;
  storageLimitBytes: number | null;
}

/**
 * Reads the organization's current plan limits via its subscription. Self-
 * hosted installs never call this — every enforcement point checks
 * hasDirectDatabase() first, same convention as isHostedProjectLimitReached.
 */
export async function getOrgPlanLimits(organizationId: string): Promise<OrgPlanLimits> {
  const { createServiceClient } = await import("@/lib/supabase-server");
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plans (name, project_limit, task_limit_per_project, storage_limit_bytes)")
    .eq("organization_id", organizationId)
    .single();

  if (error || !data?.plans) {
    // No subscription row (shouldn't happen post-014/015, but fail closed
    // to Free's limits rather than crashing or silently going unlimited).
    return { planName: "Free", projectLimit: 2, taskLimitPerProject: 50, storageLimitBytes: 500 * 1024 * 1024 };
  }

  const plan = data.plans as unknown as {
    name: string;
    project_limit: number | null;
    task_limit_per_project: number | null;
    storage_limit_bytes: number | null;
  };

  return {
    planName: plan.name,
    projectLimit: plan.project_limit,
    taskLimitPerProject: plan.task_limit_per_project,
    storageLimitBytes: plan.storage_limit_bytes,
  };
}

/** `limit === null` means unlimited, same convention as the plans table itself. */
export function isTaskLimitReached(currentTaskCount: number, limit: number | null): boolean {
  if (limit === null) return false;
  return currentTaskCount >= limit;
}

/** Same convention: `limit === null` means unlimited. */
export function isStorageLimitReached(currentUsageBytes: number, limit: number | null): boolean {
  if (limit === null) return false;
  return currentUsageBytes >= limit;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/limits.ts
git commit -m "Add getOrgPlanLimits and task/storage limit checks"
```

---

### Task 3: Organization storage usage

**Files:**
- Modify: `src/lib/storage/storage.ts`

- [ ] **Step 1: Add `getOrganizationStorageUsage`**

Add near `getProjectStorageUsage` (after it, before `checkProjectStorageQuota`):

```typescript
/**
 * Total bytes stored across every project in an organization. Sums
 * project_files.size_bytes joined through projects, the same source
 * getProjectStorageUsage reads — not StorageProvider.usage(), which would
 * require listing every project's storage prefix separately for one
 * number the database already has indexed.
 */
export async function getOrganizationStorageUsage(organizationId: string): Promise<number> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('project_files')
    .select('size_bytes, projects!inner(organization_id)')
    .eq('projects.organization_id', organizationId);

  if (error) {
    console.error('[Storage] Error fetching organization storage:', error);
    return 0;
  }

  return data?.reduce((sum, file) => sum + (file.size_bytes || 0), 0) || 0;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. If the Supabase JS types reject the
`projects!inner(organization_id)` embedded-filter syntax, fall back to two
queries: `SELECT id FROM projects WHERE organization_id = $1` then
`SELECT size_bytes FROM project_files WHERE project_id = ANY($1)` — read
`getStorageProvider`/existing query patterns in this file for the
established two-step style already used elsewhere if the embedded filter
doesn't type-check cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/storage.ts
git commit -m "Add getOrganizationStorageUsage for plan-limit enforcement"
```

---

### Task 4: Enforce the task-per-project limit

**Files:**
- Modify: `src/app/projects/[id]/work/actions.ts`

- [ ] **Step 1: Add the import**

```typescript
import { getOrgPlanLimits, isTaskLimitReached } from "@/lib/limits";
```

- [ ] **Step 2: Check before inserting, hosted path only**

In `createTask()`, immediately after the existing permission check (`if (!access || !canWriteProject(access.role))`) and before the `if (!input.title.trim())` check, add:

```typescript
  if (!hasDirectDatabase()) {
    const { planName, taskLimitPerProject } = await getOrgPlanLimits(access.project.organization_id);

    const supabase = await createClient();
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("parent_task_id", null);

    if (isTaskLimitReached(count ?? 0, taskLimitPerProject)) {
      return {
        task: null,
        error: `You've reached your ${planName} plan's limit of ${taskLimitPerProject} tasks per project. Upgrade your plan to raise this limit.`,
      };
    }
  }
```

`access.project.organization_id` is already available on `ProjectAccess`
(`src/lib/data/project-access.ts`, confirmed by reading it during this
plan's research) — no new data fetch needed for that part. `createClient`
is already imported in this file (used lower down in the Supabase branch).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/projects/[id]/work/actions.ts"
git commit -m "Enforce the plan's task-per-project limit when creating a task"
```

---

### Task 5: Enforce the storage-per-organization limit

**Files:**
- Modify: `src/app/projects/[id]/files/actions.ts`

- [ ] **Step 1: Add the imports**

```typescript
import { getOrgPlanLimits, isStorageLimitReached } from "@/lib/limits";
import { getOrganizationStorageUsage } from "@/lib/storage/storage";
```

- [ ] **Step 2: Check before uploading, hosted path only**

In `uploadFile()`, after the existing permission check and the `file`
validation (`if (!(file instanceof File) || file.size === 0)`), before the
`try` block that calls `uploadProjectFile`, add:

```typescript
  if (!hasDirectDatabase()) {
    const { planName, storageLimitBytes } = await getOrgPlanLimits(access.project.organization_id);
    const currentUsage = await getOrganizationStorageUsage(access.project.organization_id);

    if (isStorageLimitReached(currentUsage + file.size, storageLimitBytes)) {
      return {
        error: `This upload would exceed your ${planName} plan's storage limit. Upgrade your plan to raise this limit.`,
      };
    }
  }
```

(`access.project.organization_id` — same field, confirmed available the
same way as Task 4.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/projects/[id]/files/actions.ts"
git commit -m "Enforce the plan's storage limit when uploading a file"
```

---

### Task 6: Install the shadcn `progress` primitive

**Files:**
- Create: `src/components/ui/progress.tsx`

- [ ] **Step 1: Install**

```bash
npx shadcn@latest add progress
```

Answer any overwrite prompt `n` (this component shouldn't collide with
anything existing, but the sidebar install in Plan 1b showed prompts can
appear for shared dependencies — decline any that ask about files other
than `progress.tsx` itself).

- [ ] **Step 2: Verify it uses the flattened shape from Plan 1a**

Read the generated `src/components/ui/progress.tsx`. If its root element
carries a `shadow` class (shadcn's stock primitives sometimes do), remove
it, matching Plan 1a's Task 4 decision to keep every primitive flat/no
shadow. If it doesn't have one, no change needed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/progress.tsx package.json package-lock.json
git commit -m "Install the shadcn progress primitive"
```

---

### Task 7: Billing page

**Files:**
- Create: `src/app/organizations/[id]/billing/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/organizations/[id]/billing/page.tsx`:

```typescript
import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppShell } from "@/components/layout/app-shell";
import { requireOrgAccess } from "@/lib/data/org-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { getOrgPlanLimits } from "@/lib/limits";
import { getOrganizationStorageUsage } from "@/lib/storage/storage";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";

interface PlanRow {
  id: string;
  name: string;
  price_cents: number;
  project_limit: number | null;
  task_limit_per_project: number | null;
  storage_limit_bytes: number | null;
  has_ai_features: boolean;
  has_github_integration: boolean;
  has_advanced_analytics: boolean;
  has_team_roles: boolean;
  has_audit_logs: boolean;
  has_priority_support: boolean;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unlimited";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatCount(value: number | null): string {
  return value === null ? "Unlimited" : value.toLocaleString();
}

function formatPrice(cents: number): string {
  return cents === 0 ? "Free" : `€${(cents / 100).toFixed(2)}/mo`;
}

export default async function BillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;
  const [, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);

  if (hasDirectDatabase()) {
    return (
      <AppShell user={user}>
        <div className="container mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/organizations/${orgId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">Billing</h1>
          </div>
          <Card>
            <CardContent className="py-6 text-muted-foreground">
              Self-hosted installs have no plan limits — billing only applies to Guidon Cloud.
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const supabase = createServiceClient();

  const [{ data: plansData }, projectCount, planLimits, storageUsage] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    getOrgPlanLimits(orgId),
    getOrganizationStorageUsage(orgId),
  ]);

  const plans = (plansData ?? []) as PlanRow[];
  const currentProjectCount = projectCount.count ?? 0;

  const usageRows = [
    { label: "Projects", used: currentProjectCount, limit: planLimits.projectLimit, format: formatCount },
    { label: "Storage", used: storageUsage, limit: planLimits.storageLimitBytes, format: (v: number | null) => formatBytes(v) },
  ];

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/organizations/${orgId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Billing</h1>
            <p className="text-muted-foreground">Current plan: {planLimits.planName}</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Against your {planLimits.planName} plan's limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usageRows.map((row) => {
              const percent = row.limit ? Math.min(100, (row.used / row.limit) * 100) : 0;
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="text-muted-foreground">
                      {row.format(row.used)} / {row.format(row.limit)}
                    </span>
                  </div>
                  {row.limit !== null && <Progress value={percent} />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
            <CardDescription>Contact your instance administrator to change your organization's plan.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>Plan</th>
                  <th>Price</th>
                  <th>Projects</th>
                  <th>Tasks/project</th>
                  <th>Storage</th>
                  <th>AI</th>
                  <th>GitHub</th>
                  <th>Team roles</th>
                  <th>Audit logs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans.map((plan) => (
                  <tr
                    key={plan.id}
                    className={`[&>td]:px-4 [&>td]:py-3 ${plan.name === planLimits.planName ? "bg-primary/5" : ""}`}
                  >
                    <td className="font-medium">{plan.name}</td>
                    <td>{formatPrice(plan.price_cents)}</td>
                    <td>{formatCount(plan.project_limit)}</td>
                    <td>{formatCount(plan.task_limit_per_project)}</td>
                    <td>{formatBytes(plan.storage_limit_bytes)}</td>
                    <td>{plan.has_ai_features ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                    <td>{plan.has_github_integration ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                    <td>{plan.has_team_roles ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                    <td>{plan.has_audit_logs ? <Check className="h-4 w-4 text-success" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
```

The `requireOrgAccess(orgId)` result is discarded via an array hole
(`const [, user] = ...`) — it's called purely for its gating side effect
(redirects if the caller isn't an org member), and the page only ever
needs `orgId` itself (already in scope) for its queries, not any field of
the access result. No unused-variable warning results, since nothing is
bound to a name.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/organizations/[id]/billing/page.tsx"
git commit -m "Add the organization billing page: usage and plan comparison"
```

---

### Task 8: Billing button on the organization page

**Files:**
- Modify: `src/app/organizations/[id]/page.tsx`

- [ ] **Step 1: Add the icon import**

Replace the `lucide-react` import line (currently
`import { ArrowLeft, FolderKanban, Plus, Users } from "lucide-react";`):

```typescript
import { ArrowLeft, CreditCard, FolderKanban, Plus, Users } from "lucide-react";
```

- [ ] **Step 2: Add the button**

After the existing "Members" button (currently lines 57-62), add:

```typescript
          <Button variant="outline" asChild>
            <Link href={`/organizations/${orgId}/billing`}>
              <CreditCard className="h-4 w-4 mr-2" />
              Billing
            </Link>
          </Button>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/organizations/[id]/page.tsx"
git commit -m "Add a Billing link to the organization page header"
```

---

### Task 9: Admin plan editor

**Files:**
- Modify: `src/lib/data/admin.ts`
- Modify: `src/app/admin/organizations/actions.ts`
- Create: `src/app/admin/organizations/plan-editor.tsx`
- Modify: `src/app/admin/organizations/page.tsx`

- [ ] **Step 1: `admin.ts` — include the plan in the org list query**

Confirmed by reading the current file: `listOrganizationsForAdmin()`
resolves member/owner data via a **separate** query keyed by `orgIds`,
merged in JS via `Map`s (not an embedded Supabase relation select) — the
plan/subscription addition follows that exact same established pattern,
not a nested `.select()`.

`AdminOrganizationRow` (currently lines 63-71) gains two fields:

```typescript
export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  project_limit: number;
  planId: string;
  planName: string;
  memberCount: number;
  owner: { email: string; full_name: string | null } | null;
}
```

Inside `listOrganizationsForAdmin()`, after the existing `memberRows`
fetch (both branches, currently ending around lines 118 and 139) and
before the `countByOrg`/`ownerByOrg` loop (currently line 145), add a
second lookup:

```typescript
  let subscriptionRows: { organization_id: string; plan_id: string; plan_name: string }[];

  if (hasDirectDatabase()) {
    subscriptionRows = await withServiceRole(({ query }) =>
      query(
        `SELECT s.organization_id, s.plan_id, p.name AS plan_name
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
         WHERE s.organization_id = ANY($1::uuid[])`,
        [orgIds]
      ).then((result) => result.rows)
    );
  } else {
    const supabase = createServiceClient();
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("organization_id, plan_id, plans (name)")
      .in("organization_id", orgIds);

    subscriptionRows = (subs ?? []).map((row) => ({
      organization_id: row.organization_id,
      plan_id: row.plan_id,
      plan_name: (row.plans as unknown as { name: string } | null)?.name ?? "Free",
    }));
  }

  const planByOrg = new Map(subscriptionRows.map((row) => [row.organization_id, row]));
```

(A second `const supabase = createServiceClient();` inside the `else`
branch shadows the outer one from the member-lookup block above it — this
mirrors how `organizations`, `member`, and now `subscription` lookups are
each their own small, independent query in this function; do not try to
reuse a single `supabase` variable across all three if the existing code
doesn't already do so — read the surrounding lines to confirm before
choosing between adding a new `const` or reusing an existing one in
scope.)

Then extend the final row mapping (currently lines 152-160):

```typescript
  const rows: AdminOrganizationRow[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    created_at: org.created_at,
    project_limit: org.project_limit,
    planId: planByOrg.get(org.id)?.plan_id ?? "free",
    planName: planByOrg.get(org.id)?.plan_name ?? "Free",
    memberCount: countByOrg.get(org.id) ?? 0,
    owner: ownerByOrg.get(org.id) ?? null,
  }));
```

- [ ] **Step 2: New Server Action**

Add to `src/app/admin/organizations/actions.ts`:

```typescript
export type UpdatePlanState = {
  error: string | null;
};

/**
 * Admin-only plan change (no self-service upgrade in this phase — see the
 * spec's "Context" section for why). Updates both the subscription's
 * plan_id and organizations.project_limit together, so the two stay in
 * sync at the moment of an actual plan change; project_limit remains
 * independently editable afterward via updateOrganizationProjectLimit.
 */
export async function updateOrganizationPlan(
  orgId: string,
  planId: string
): Promise<UpdatePlanState> {
  await requireAdminAccess();

  const validPlanIds = ["free", "pro", "team", "business"];
  if (!validPlanIds.includes(planId)) {
    return { error: "Unknown plan." };
  }

  const UNLIMITED_SENTINEL = 2147483647;

  if (hasDirectDatabase()) {
    await withServiceRole(({ query }) =>
      query(
        `UPDATE subscriptions SET plan_id = $1, current_period_start = now(), cancel_at_period_end = false, updated_at = now() WHERE organization_id = $2`,
        [planId, orgId]
      )
    );
    const planRow = await withServiceRole(({ query }) =>
      query("SELECT project_limit FROM plans WHERE id = $1", [planId])
    );
    const newLimit = planRow.rows[0]?.project_limit ?? UNLIMITED_SENTINEL;
    await withServiceRole(({ query }) =>
      query("UPDATE organizations SET project_limit = $1 WHERE id = $2", [
        newLimit ?? UNLIMITED_SENTINEL,
        orgId,
      ])
    );
  } else {
    const supabase = createServiceClient();

    const { data: plan } = await supabase
      .from("plans")
      .select("project_limit")
      .eq("id", planId)
      .single();

    const { error: subError } = await supabase
      .from("subscriptions")
      .update({ plan_id: planId, current_period_start: new Date().toISOString(), cancel_at_period_end: false })
      .eq("organization_id", orgId);

    if (subError) return { error: subError.message };

    const { error: orgError } = await supabase
      .from("organizations")
      .update({ project_limit: plan?.project_limit ?? UNLIMITED_SENTINEL })
      .eq("id", orgId);

    if (orgError) return { error: orgError.message };
  }

  revalidatePath("/admin/organizations");
  return { error: null };
}
```

(`requireAdminAccess`, `hasDirectDatabase`, `withServiceRole`,
`createServiceClient`, `revalidatePath` are all already imported in this
file per the existing `updateOrganizationProjectLimit` action — no new
imports needed beyond what's already there.)

- [ ] **Step 3: `PlanEditor` component**

Create `src/app/admin/organizations/plan-editor.tsx`, mirroring
`project-limit-editor.tsx`'s structure exactly but with a `<select>`
instead of a number `<Input>`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateOrganizationPlan } from "./actions";

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
  { value: "business", label: "Business" },
];

export function PlanEditor({
  orgId,
  initialPlanId,
}: {
  orgId: string;
  initialPlanId: string;
}) {
  const [value, setValue] = useState(initialPlanId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (planId: string) => {
    setValue(planId);
    startTransition(async () => {
      const result = await updateOrganizationPlan(orgId, planId);
      setError(result.error);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => save(e.target.value)}
        disabled={pending}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {PLAN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
```

(No separate "Save" button — changing the select immediately saves, since
a plan change isn't a numeric value someone would type incrementally like
the project-limit field; `Button` import is unused if not needed elsewhere
in the file — omit it if `select`-only compiles clean without it.)

- [ ] **Step 4: Wire into the admin organizations table**

In `src/app/admin/organizations/page.tsx`, add the import:

```typescript
import { PlanEditor } from "./plan-editor";
```

Add a `<th>Plan</th>` next to the existing `<th>Project limit</th>`, and a
matching `<td><PlanEditor orgId={org.id} initialPlanId={org.planId} /></td>`
next to the existing `<ProjectLimitEditor>` cell.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin.ts src/app/admin/organizations/actions.ts src/app/admin/organizations/plan-editor.tsx src/app/admin/organizations/page.tsx
git commit -m "Add admin-only plan changer to the organizations table"
```

---

### Task 10: Update `docs/self-hosting.md` for the new Free default

**Files:**
- Modify: `docs/self-hosting.md`

- [ ] **Step 1: Update the comparison table and explanatory paragraph**

The table row and paragraph updated in the earlier project-limit plan
(`| Projects per organization | 1 by default, admin-adjustable per org |...`
and the "**The project-per-organization cap is specific to Cloud.** Every
organization starts at 1 project..." paragraph) both need "1" replaced
with "2" to match this phase's new default, and a mention that the default
now comes from the organization's plan (Free = 2), not a flat constant.
Read the current text first — it may have shifted slightly since first
written — and update both occurrences consistently with this phase's
actual behavior.

- [ ] **Step 2: Commit**

```bash
git add docs/self-hosting.md
git commit -m "Update self-hosting docs: Free plan default is 2 projects"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, type-check, lint, build**

```bash
npm run test:db
npm run test:limits
npx tsc --noEmit
npm run lint
npm run build
```

Expected: `test:db` and `test:limits` both `0 fail`. `tsc` clean. `lint`
shows only the pre-existing `no-explicit-any` debt from prior plans this
session — no new errors. `build` succeeds, including
`/organizations/[id]/billing`.

- [ ] **Step 2: Trace the enforcement paths by reading the final files**

Confirm: `createTask()` and file `uploadFile()` both call
`getOrgPlanLimits()` gated by `!hasDirectDatabase()`, and that self-hosted
installs hit neither check (matching every other limit in this codebase).

- [ ] **Step 3: Browser check, if the Browser pane and a real backend cooperate**

Same constraint as every prior plan this session — no live Supabase/local
storage credentials in this environment, so this is a static/DOM check of
`/organizations/[id]/billing`'s rendered markup (via `read_page`/
`get_page_text`) rather than a full authenticated click-through with real
usage data.
