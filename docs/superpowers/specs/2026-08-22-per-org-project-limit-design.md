# Per-organization project limit — design

## Problem

Guidon Cloud (hosted, no `DATABASE_URL`) caps every organization at 1
project via the hardcoded constant `HOSTED_PROJECT_LIMIT_PER_ORG` in
`src/lib/limits.ts`. There is no way to raise that cap for a specific
organization (e.g. a paying customer) without a code change and redeploy.
Self-hosted installs (`DATABASE_URL` set) already have no limit at all —
out of scope, unaffected by this change.

## Goal

An instance admin (gated by the existing `ADMIN_EMAILS` allowlist, see
`src/lib/data/admin-access.ts`) can set a per-organization project limit
from the admin panel. New organizations still default to 1. Only admins
can change it — an organization's own owner/admin must not be able to
self-elevate their limit.

Not building: an "unlimited" sentinel value (numeric cap only), and no new
dedicated admin org-detail page — the limit is edited inline in the
existing `/admin/organizations` table.

## Schema

New migration `014_organization_project_limit.sql`:

```sql
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS project_limit integer NOT NULL DEFAULT 1
        CHECK (project_limit >= 1);
```

### Security: column-level grant, not just RLS

`organizations_update` (001_initial_schema.sql) allows an organization's
own owner/admin to update *any* column on their row:

```sql
CREATE POLICY organizations_update ON public.organizations FOR UPDATE
    TO authenticated
    USING (private.org_role(id) IN ('owner', 'admin'))
    WITH CHECK (private.org_role(id) IN ('owner', 'admin'));
```

Table-level `GRANT UPDATE ... TO authenticated` currently covers all
columns, so adding `project_limit` as a plain column would let an org
owner raise their own limit directly through the Supabase client — RLS
alone doesn't stop it. The migration narrows the grant:

```sql
REVOKE UPDATE ON public.organizations FROM authenticated;
GRANT UPDATE (name, slug, description) ON public.organizations TO authenticated;
```

`service_role` already holds `GRANT ALL ON ALL TABLES IN SCHEMA public`
(000_auth_compat.sql) independent of this REVOKE, so the admin Server
Action (which uses `createServiceClient()` / `withServiceRole()`) is
unaffected and remains the only way to write `project_limit`.

No existing code currently updates `organizations` through the
`authenticated` path (confirmed by search), so narrowing the grant to
those three columns changes nothing observable today — it only closes the
gap the new column would otherwise open.

## Business logic

- `src/lib/limits.ts`: `isHostedProjectLimitReached(currentProjectCount, limit = HOSTED_PROJECT_LIMIT_PER_ORG)` takes the limit as a parameter instead of reading the module constant directly. The constant stays as the fallback/default (and as the column's DB default).
- `HOSTED_PROJECT_LIMIT_MESSAGE` (string) becomes `hostedProjectLimitMessage(limit: number)` (function), so the copy reflects the organization's actual limit.
- `src/lib/data/org-access.ts` (`getOrgAccess`): add `project_limit` to the selected/queried columns in both the self-hosted (`withUser` SQL) and Supabase branches, and to the `OrgAccess.organization` type.
- `src/app/organizations/[id]/actions.ts` (`createProject`): pass `access.organization.project_limit` into `isHostedProjectLimitReached` instead of relying on the default.
- `src/app/organizations/[id]/page.tsx`: same — pass the org's limit, and render `hostedProjectLimitMessage(organization.project_limit)`.
- Self-hosted path is untouched: `isHostedProjectLimitReached` still returns `false` immediately when `hasDirectDatabase()` is true, regardless of the limit argument.

## Admin UI

`src/app/admin/organizations/page.tsx`: add a "Project limit" column to
the existing table. Each row gets a small inline form: a `number` input
(min 1, defaulting to the row's current value) and a "Save" button,
posting to a new Server Action.

`src/app/admin/organizations/actions.ts` (new file):

```ts
"use server";
export async function updateOrganizationProjectLimit(orgId: string, newLimit: number) { ... }
```

- Calls `requireAdminAccess()` first (same gate every other admin page/action uses).
- Validates `newLimit` is a positive integer.
- Self-hosted: `withServiceRole(({ query }) => query("UPDATE organizations SET project_limit = $1 WHERE id = $2", [newLimit, orgId]))`.
- Supabase: `createServiceClient().from("organizations").update({ project_limit: newLimit }).eq("id", orgId)`.
- `revalidatePath("/admin/organizations")` on success.
- Implemented for both branches for consistency with the rest of the admin data layer (`src/lib/data/admin.ts`), even though self-hosted installs never enforce the limit — the value is still stored so admin data stays consistent if an install later starts enforcing it.

`listOrganizationsForAdmin` (`src/lib/data/admin.ts`) adds `project_limit`
to `AdminOrganizationRow` and to both branches' queries.

## Tests

`tests/limits.test.mjs`: extend the mirrored `isHostedProjectLimitReached`
to accept a `limit` parameter and add cases:
- limit=3, count=2 → not reached
- limit=3, count=3 → reached
- self-hosted (`DATABASE_URL` set) with a high count and a low limit → still never reached (limit argument is irrelevant when self-hosted)

## Out of scope

- "Unlimited" sentinel value.
- Dedicated `/admin/organizations/[id]` detail page.
- Any self-serve way for an org to request/see a higher limit (this is an admin-only, manual-for-now control).
