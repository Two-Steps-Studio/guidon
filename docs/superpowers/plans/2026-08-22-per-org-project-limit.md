# Per-Organization Project Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an instance admin raise the Guidon Cloud project-per-organization cap for one specific organization, instead of the current hardcoded global "1 project per org."

**Architecture:** Add `organizations.project_limit` (default 1, writable only by `service_role` via a column-level `GRANT`, closing an RLS gap the existing owner/admin `UPDATE` policy would otherwise leave open). Thread the per-org value through `isHostedProjectLimitReached()` instead of a fixed constant, and expose an inline editor on the existing `/admin/organizations` admin page, backed by a new admin-gated Server Action.

**Tech Stack:** Next.js Server Actions, Supabase (hosted) / `pg` via `withServiceRole` (self-hosted), PGlite-based migration test (`tests/db/compat.test.mjs`), plain Node `.mjs` unit test (`tests/limits.test.mjs`).

Spec: `docs/superpowers/specs/2026-08-22-per-org-project-limit-design.md`

---

### Task 1: Migration — `organizations.project_limit` + column-level grant

**Files:**
- Create: `src/db/migrations/014_organization_project_limit.sql`
- Modify: `tests/db/compat.test.mjs:778-780` (insert new section 14 before the final summary `console.log`)

- [ ] **Step 1: Write the migration**

Create `src/db/migrations/014_organization_project_limit.sql`:

```sql
-- ============================================================
-- GUIDON — MIGRACJA 014
-- Limit projektów per organizacja: organizations.project_limit
-- ============================================================
--
-- Uruchomić PO 013.
--
-- POWÓD
-- -----
-- Guidon Cloud (hosted, brak DATABASE_URL) ogranicza każdą organizację
-- do 1 projektu przez stałą HOSTED_PROJECT_LIMIT_PER_ORG
-- (src/lib/limits.ts). Nie było sposobu podnieść ten limit dla
-- konkretnej organizacji bez zmiany kodu i redeployu. Self-hosted
-- (DATABASE_URL ustawione) nie ma i nadal nie będzie miał żadnego
-- limitu — bez zmian.
--
-- Ta migracja dodaje project_limit jako kolumnę per-organizacja,
-- domyślnie 1 (dzisiejsze zachowanie), edytowalną tylko przez panel
-- admina (src/app/admin/organizations).
--
-- BEZPIECZEŃSTWO: GRANT na poziomie kolumny, nie tylko RLS
-- --------------------------------------------------------
-- Polityka organizations_update (001) pozwala właścicielowi/adminowi
-- organizacji nadpisać DOWOLNĄ kolumnę swojego wiersza:
--
--   USING (private.org_role(id) IN ('owner', 'admin'))
--   WITH CHECK (private.org_role(id) IN ('owner', 'admin'))
--
-- 001 nadaje też GRANT UPDATE ... TO authenticated bez ograniczenia
-- do kolumn. Bez interwencji właściciel organizacji mógłby więc sam
-- podnieść sobie project_limit przez zwykłe wywołanie
-- supabase.from('organizations').update(...) — RLS by tego nie
-- zatrzymało, bo polityka nie patrzy na to, KTÓRE kolumny się zmieniają.
--
-- Rozwiązanie: REVOKE całościowego UPDATE od authenticated i GRANT
-- z powrotem tylko na (name, slug, description) — te trzy kolumny są
-- jedynymi, które kod aplikacji mógłby dziś aktualizować (obecnie
-- żaden kod wcale nie robi UPDATE na organizations, więc to zawężenie
-- niczego dziś nie psuje). service_role ma już GRANT ALL ON ALL TABLES
-- (000_auth_compat.sql), więc panel admina (createServiceClient() /
-- withServiceRole()) zapisuje project_limit bez przeszkód — to jedyna
-- uprawniona ścieżka zapisu tej kolumny.
-- ============================================================

BEGIN;


ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS project_limit integer NOT NULL DEFAULT 1
        CHECK (project_limit >= 1);


REVOKE UPDATE ON public.organizations FROM authenticated;

GRANT UPDATE (name, slug, description)
    ON public.organizations
    TO authenticated;


COMMIT;
```

- [ ] **Step 2: Add the PGlite assertions**

In `tests/db/compat.test.mjs`, insert a new section right before the final
summary (currently line 780: `console.log(\`\n  ${pass} pass / ${fail} fail\n\`);`),
i.e. immediately after the `check("ON DELETE CASCADE z tasks kasuje probe", ...)`
line that ends section 13:

```javascript
// ------------------------------------------------------------------
section("14. project_limit — grant na poziomie kolumny (migracja 014)");

await withUser(A, async () => {
  const rename = await db.query(
    "UPDATE public.organizations SET name = $1 WHERE id = $2 RETURNING name",
    ["Test zmieniona", orgId]
  );
  check(
    "wlasciciel moze zmienic name (dozwolona kolumna)",
    rename.rows[0]?.name === "Test zmieniona",
    JSON.stringify(rename.rows)
  );
});

await expectRejected(
  "wlasciciel NIE moze zmienic project_limit (kolumna zarezerwowana dla service_role)",
  () =>
    withUser(A, () =>
      db.query("UPDATE public.organizations SET project_limit = 99 WHERE id = $1", [orgId])
    ),
  /permission denied/i
);

await withServiceRole(async () => {
  const updated = await db.query(
    "UPDATE public.organizations SET project_limit = 5 WHERE id = $1 RETURNING project_limit",
    [orgId]
  );
  check(
    "service_role moze podniesc project_limit",
    updated.rows[0]?.project_limit === 5,
    JSON.stringify(updated.rows)
  );
});
```

This uses the `orgId` and `A` bindings already established in section 4
(line 206-237) — organization `orgId` is owned by user `A` and both are
still in scope this far down the file.

- [ ] **Step 3: Run the migration test**

Run: `npm run test:db`
Expected: all sections pass, including the three new checks in section 14,
ending with `0 fail`.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/014_organization_project_limit.sql tests/db/compat.test.mjs
git commit -m "Add organizations.project_limit column with admin-only write grant"
```

---

### Task 2: `src/lib/limits.ts` — accept a per-org limit

**Files:**
- Modify: `src/lib/limits.ts`
- Modify: `tests/limits.test.mjs`

- [ ] **Step 1: Write the failing test**

Edit `tests/limits.test.mjs`. Replace the mirrored function (lines 37-40)
so it takes a `limit` parameter, and add two new test functions. Full
replacement of the file's function/test bodies (keep the `check`/`section`
helpers and `main()` shape, only these parts change):

```javascript
function isHostedProjectLimitReached(currentProjectCount, limit = HOSTED_PROJECT_LIMIT_PER_ORG) {
  if (hasDirectDatabase()) return false;
  return currentProjectCount >= limit;
}

function testHostedMode() {
  section("tryb hostowany (brak DATABASE_URL) — domyslny limit 1 projektu/organizacje");

  delete process.env.DATABASE_URL;

  check("0 projektow: limit nieosiagniety", !isHostedProjectLimitReached(0));
  check("1 projekt: limit osiagniety", isHostedProjectLimitReached(1));
  check("2 projekty: limit dalej osiagniety", isHostedProjectLimitReached(2));
}

function testCustomLimit() {
  section("tryb hostowany, niestandardowy limit organizacji (project_limit z DB)");

  delete process.env.DATABASE_URL;

  check("limit=3, 2 projekty: nieosiagniety", !isHostedProjectLimitReached(2, 3));
  check("limit=3, 3 projekty: osiagniety", isHostedProjectLimitReached(3, 3));
  check("limit=3, 4 projekty: nadal osiagniety", isHostedProjectLimitReached(4, 3));
}

function testSelfHostedMode() {
  section("tryb self-hosted (DATABASE_URL ustawione) — brak limitu");

  process.env.DATABASE_URL = "postgresql://guidon:test@localhost:5432/guidon";

  check("0 projektow: bez limitu", !isHostedProjectLimitReached(0));
  check("1 projekt: bez limitu", !isHostedProjectLimitReached(1));
  check("100 projektow: nadal bez limitu", !isHostedProjectLimitReached(100));
  check(
    "wysoki limit organizacji ignorowany: nadal bez limitu",
    !isHostedProjectLimitReached(100, 1)
  );

  delete process.env.DATABASE_URL;
}

function main() {
  testHostedMode();
  testCustomLimit();
  testSelfHostedMode();

  console.log(`\n  ${pass} pass / ${fail} fail\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 2: Run test to verify it still passes at the mirror level**

Run: `npm run test:limits`
Expected: PASS, `0 fail` — this step only proves the mirrored logic in the
test file itself is correct before touching the real module.

- [ ] **Step 3: Update the real module to match**

Replace `src/lib/limits.ts` in full:

```typescript
import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";

/**
 * Guidon Cloud (hosted — no self-managed Postgres) caps an organization's
 * project count. Self-hosted installs (DATABASE_URL set) have no such limit
 * — it's your own infrastructure, not a shared resource Guidon is paying for.
 *
 * The cap itself lives per-organization on organizations.project_limit
 * (migration 014), defaulting to HOSTED_PROJECT_LIMIT_PER_ORG for every new
 * organization. An instance admin can raise it for a specific organization
 * from /admin/organizations — see src/app/admin/organizations/actions.ts.
 * Kept in one place so the UI's "hide the button" check and the Server
 * Action's actual enforcement can never drift apart from each other.
 */
export const HOSTED_PROJECT_LIMIT_PER_ORG = 1;

export function isHostedProjectLimitReached(
  currentProjectCount: number,
  limit: number = HOSTED_PROJECT_LIMIT_PER_ORG
): boolean {
  if (hasDirectDatabase()) return false;
  return currentProjectCount >= limit;
}

export function hostedProjectLimitMessage(limit: number): string {
  const projectWord = limit === 1 ? "project" : "projects";
  return `Guidon Cloud is limited to ${limit} ${projectWord} per organization. Create another organization, or self-host Guidon for unlimited projects.`;
}
```

Note: `HOSTED_PROJECT_LIMIT_MESSAGE` (the old string constant) is removed —
Task 3 and Task 4 update its two call sites to use `hostedProjectLimitMessage()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:limits`
Expected: PASS, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/limits.ts tests/limits.test.mjs
git commit -m "Make the hosted project limit per-organization instead of a fixed constant"
```

---

### Task 3: `src/lib/data/org-access.ts` — read `project_limit`

**Files:**
- Modify: `src/lib/data/org-access.ts:11-22` (the `OrgAccess` interface)
- Modify: `src/lib/data/org-access.ts:46-51` (self-hosted SQL branch)
- Modify: `src/lib/data/org-access.ts:76-81` (Supabase branch)

- [ ] **Step 1: Widen the `OrgAccess.organization` type**

In `src/lib/data/org-access.ts`, change the interface (currently lines 11-22):

```typescript
export interface OrgAccess {
  userId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    project_limit: number;
    created_at: string;
    updated_at: string;
  };
  role: OrganizationRole | null;
}
```

- [ ] **Step 2: Select the new column in both branches**

Self-hosted branch (currently lines 48-51):

```typescript
        query(
          "SELECT id, name, slug, description, project_limit, created_at, updated_at FROM organizations WHERE id = $1",
          [orgId]
        ),
```

Supabase branch (currently lines 77-81):

```typescript
    supabase
      .from("organizations")
      .select("id, name, slug, description, project_limit, created_at, updated_at")
      .eq("id", orgId)
      .maybeSingle(),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/data/org-access.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/org-access.ts
git commit -m "Read organizations.project_limit in getOrgAccess"
```

---

### Task 4: Enforce the per-org limit in `createProject`

**Files:**
- Modify: `src/app/organizations/[id]/actions.ts:10` (import)
- Modify: `src/app/organizations/[id]/actions.ts:82-84` (the check)

- [ ] **Step 1: Update the import**

Change line 10 of `src/app/organizations/[id]/actions.ts`:

```typescript
import { isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
```

- [ ] **Step 2: Pass the org's own limit into the check**

Replace lines 82-84 (inside the Supabase/hosted branch of `createProject`):

```typescript
    if (isHostedProjectLimitReached(siblingSlugs?.length ?? 0, access.organization.project_limit)) {
      return { error: hostedProjectLimitMessage(access.organization.project_limit) };
    }
```

`access` is already in scope — it's the `getOrgAccess(orgId)` result assigned
at the top of `createProject` (line 21), and Task 3 already made
`access.organization.project_limit` available on it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/app/organizations/[id]/actions.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/organizations/[id]/actions.ts
git commit -m "Enforce each organization's own project_limit when creating a project"
```

---

### Task 5: Show the per-org limit on the organization page

**Files:**
- Modify: `src/app/organizations/[id]/page.tsx:10` (import)
- Modify: `src/app/organizations/[id]/page.tsx:42` (the check)
- Modify: `src/app/organizations/[id]/page.tsx:75` (the message)

- [ ] **Step 1: Update the import**

Change line 10 of `src/app/organizations/[id]/page.tsx`:

```typescript
import { isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
```

- [ ] **Step 2: Pass the org's limit into the check**

Replace line 42:

```typescript
  const limitReached = isHostedProjectLimitReached(projects.length, organization.project_limit);
```

- [ ] **Step 3: Use the dynamic message**

Replace line 75 (inside the `{limitReached && (...)}` block):

```typescript
              {hostedProjectLimitMessage(organization.project_limit)}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/app/organizations/[id]/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/organizations/[id]/page.tsx
git commit -m "Show each organization's actual project limit on its page"
```

---

### Task 6: Surface `project_limit` in the admin organizations list

**Files:**
- Modify: `src/lib/data/admin.ts:63-70` (`AdminOrganizationRow`)
- Modify: `src/lib/data/admin.ts:88-96` (self-hosted query)
- Modify: `src/lib/data/admin.ts:118-127` (Supabase query)
- Modify: `src/lib/data/admin.ts:151-158` (row mapping)

- [ ] **Step 1: Add the field to the row type**

In `src/lib/data/admin.ts`, change `AdminOrganizationRow` (currently lines 63-70):

```typescript
export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  project_limit: number;
  memberCount: number;
  owner: { email: string; full_name: string | null } | null;
}
```

- [ ] **Step 2: Widen the local `organizations` variable's type and both queries**

The local variable declaration inside `listOrganizationsForAdmin` (currently
line 88):

```typescript
  let organizations: { id: string; name: string; slug: string; created_at: string; project_limit: number }[];
```

Self-hosted query (currently lines 92-96):

```typescript
    organizations = await withServiceRole(({ query }) =>
      query("SELECT id, name, slug, project_limit, created_at FROM organizations ORDER BY created_at DESC LIMIT $1", [
        LIST_LIMIT,
      ]).then((result) => result.rows)
    );
```

Supabase query (currently lines 121-125):

```typescript
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name, slug, project_limit, created_at")
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
```

- [ ] **Step 3: Include it in the mapped rows**

Replace the `rows` mapping (currently lines 151-158):

```typescript
  const rows: AdminOrganizationRow[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    created_at: org.created_at,
    project_limit: org.project_limit,
    memberCount: countByOrg.get(org.id) ?? 0,
    owner: ownerByOrg.get(org.id) ?? null,
  }));
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/data/admin.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/admin.ts
git commit -m "Include project_limit in the admin organizations list query"
```

---

### Task 7: Admin Server Action to update an org's limit

**Files:**
- Create: `src/app/admin/organizations/actions.ts`

- [ ] **Step 1: Write the action**

Create `src/app/admin/organizations/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { createServiceClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";

export type UpdateProjectLimitState = {
  error: string | null;
};

/**
 * The only legal way to change organizations.project_limit (migration 014
 * revokes column-level UPDATE from `authenticated`, leaving only
 * service_role able to write it). Gated by requireAdminAccess() the same
 * way every other /admin route and action in this codebase is.
 */
export async function updateOrganizationProjectLimit(
  orgId: string,
  newLimit: number
): Promise<UpdateProjectLimitState> {
  await requireAdminAccess();

  if (!Number.isInteger(newLimit) || newLimit < 1) {
    return { error: "Project limit must be a whole number of 1 or more." };
  }

  if (hasDirectDatabase()) {
    await withServiceRole(({ query }) =>
      query("UPDATE organizations SET project_limit = $1 WHERE id = $2", [newLimit, orgId])
    );
  } else {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("organizations")
      .update({ project_limit: newLimit })
      .eq("id", orgId);

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/admin/organizations");
  return { error: null };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/app/admin/organizations/actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/organizations/actions.ts
git commit -m "Add admin Server Action to update an organization's project_limit"
```

---

### Task 8: Inline editor in the admin organizations table

**Files:**
- Create: `src/app/admin/organizations/project-limit-editor.tsx`
- Modify: `src/app/admin/organizations/page.tsx`

- [ ] **Step 1: Write the editor client component**

Create `src/app/admin/organizations/project-limit-editor.tsx`. This mirrors
the existing `useTransition`-based pattern in
`src/app/organizations/[id]/members/member-actions-menu.tsx` — a direct
Server Action call rather than a `<form>`/`useActionState`, since this is a
row-level control, not a page-level form:

```typescript
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrganizationProjectLimit } from "./actions";

export function ProjectLimitEditor({
  orgId,
  initialLimit,
}: {
  orgId: string;
  initialLimit: number;
}) {
  const [value, setValue] = useState(String(initialLimit));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsed = Number(value);
    startTransition(async () => {
      const result = await updateOrganizationProjectLimit(orgId, parsed);
      setError(result.error);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        className="h-8 w-20"
      />
      <Button size="sm" variant="outline" onClick={save} disabled={pending}>
        Save
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the admin organizations page**

In `src/app/admin/organizations/page.tsx`, add the import:

```typescript
import { ProjectLimitEditor } from "./project-limit-editor";
```

Add a `<th>Project limit</th>` to the header row (currently lines 36-42),
after `<th>Created</th>`:

```typescript
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Owner</th>
                  <th>Members</th>
                  <th>Created</th>
                  <th>Project limit</th>
                </tr>
```

Add the matching `<td>` to each row (currently lines 46-52), after the
`Created` cell:

```typescript
                  <tr key={org.id} className="[&>td]:px-4 [&>td]:py-3">
                    <td className="font-medium">{org.name}</td>
                    <td className="font-mono text-xs text-muted-foreground">{org.slug}</td>
                    <td>{org.owner ? org.owner.full_name || org.owner.email : "—"}</td>
                    <td>{org.memberCount}</td>
                    <td className="text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</td>
                    <td>
                      <ProjectLimitEditor orgId={org.id} initialLimit={org.project_limit} />
                    </td>
                  </tr>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/app/admin/organizations/page.tsx` or
`src/app/admin/organizations/project-limit-editor.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/organizations/project-limit-editor.tsx src/app/admin/organizations/page.tsx
git commit -m "Add inline project-limit editor to the admin organizations table"
```

---

### Task 9: Update `docs/self-hosting.md` for the new per-org behavior

**Files:**
- Modify: `docs/self-hosting.md:71` (comparison table row)
- Modify: `docs/self-hosting.md:78-84` (explanatory paragraph)

This doc currently describes the cap as a flat, uniform "1 project per
organization" on Cloud. After this plan, that's only the *default* — an
instance admin can raise it per organization. Leaving the doc as-is would
make it actively wrong about a capability this plan adds.

- [ ] **Step 1: Update the comparison table row**

Replace line 71:

```
| Projects per organization | 1 by default, admin-adjustable per org (`src/lib/limits.ts`) | Unlimited | Unlimited |
```

- [ ] **Step 2: Update the explanatory paragraph**

Replace the paragraph currently at lines 78-84:

```
**The project-per-organization cap is specific to Cloud.** Every
organization starts at 1 project. It's enforced server-side
(`isHostedProjectLimitReached()` in `src/lib/limits.ts`, checked in
`organizations/[id]/actions.ts`'s `createProject`, not just hidden in the
UI) and keyed off the same `hasDirectDatabase()` check as everything else in
this doc — self-hosted installs never hit it. An instance admin can raise a
specific organization's limit from `/admin/organizations`
(`organizations.project_limit`, migration 014); otherwise, create
additional organizations to get more than one project on Cloud, or
self-host for no limit at all.
```

- [ ] **Step 3: Commit**

```bash
git add docs/self-hosting.md
git commit -m "Document the per-organization project limit in the self-hosting guide"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

```bash
npm run test:db
npm run test:limits
```

Expected: both print `0 fail`.

- [ ] **Step 2: Type-check and lint the whole project**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: builds successfully. This project needs `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `DATABASE_URL`) configured in the
environment for the build to complete — use whatever this repo's `.env.local`
already has; do not invent new credentials.

- [ ] **Step 4: Note on manual browser verification**

There is no seeded database or running Supabase project available in this
environment, so a full click-through (admin sets a limit, org owner creates
a second project) is not exercised here — it's covered by the automated
tests in Task 1 (grant enforcement at the DB layer) and Task 2 (limit-check
logic). If a real environment is available later, verify manually: as an
`ADMIN_EMAILS`-listed user, raise an organization's limit on
`/admin/organizations`, then confirm that organization can create more than
one project.
