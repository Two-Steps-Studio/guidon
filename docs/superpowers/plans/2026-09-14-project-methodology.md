# Project methodology (Standard/Scrum), part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `methodology` field (`standard` | `scrum`) to projects, selectable at creation and in settings, displayed as a badge — metadata only, no sprint/backlog behavior yet (that's a later round).

**Architecture:** One new nullable-free `text` column with a CHECK constraint on `projects`, threaded through both dual-mode Server Actions (`withUser` raw SQL / Supabase client) exactly the way the existing `project_type` column already is, plus a matching UI radio group in the two places projects are created/edited.

**Tech Stack:** Next.js App Router Server Actions, Postgres (via `pg` in self-hosted mode, Supabase client in hosted mode), Radix/shadcn UI primitives already used elsewhere in these forms.

---

### Task 1: Migration + types

**Files:**
- Create: `src/db/migrations/029_project_methodology.sql`
- Modify: `src/types/project.ts`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- GUIDON - MIGRACJA 029
-- Metodologia projektu (Standardowa / Scrum) - część 1/3
-- ============================================================
--
-- Uruchomić PO 028.
--
-- KONTEKST
-- --------
-- Pierwsza część większej funkcji: projekt będzie mógł działać w trybie
-- Scrum (sprinty, backlog, story points, burndown - kolejne części), ale
-- na razie to tylko pole opisowe wybierane przy tworzeniu projektu i w
-- ustawieniach, wyświetlane jako badge - bez wpływu na tablicę Kanban ani
-- roadmapę. Odrębne od project_type (023) - to kategoria (Gra/Strona/...),
-- methodology to sposób pracy (Standardowa/Scrum).
--
-- WAŻNE: 014/017/018/023 zawęziły GRANT UPDATE na projects do konkretnej
-- listy kolumn (luka self-elevation - patrz komentarz w 023). Nowa kolumna
-- musi trafić do tej listy w tej samej migracji, inaczej zapis z ustawień
-- projektu dostanie "permission denied" mimo przejścia RLS.
-- ============================================================

BEGIN;


ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS methodology text NOT NULL DEFAULT 'standard'
    CHECK (methodology IN ('standard', 'scrum'));


REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology)
    ON public.projects
    TO authenticated;


COMMIT;
```

- [ ] **Step 2: Apply it locally against the test DB and verify the column exists**

Run: `npm run migrate:status`
Expected: `029_project_methodology.sql` listed, then after `npm run migrate`, listed as applied with no error.

(If no local `DATABASE_URL` is configured in this environment, skip actually running `npm run migrate` here — `npm run test:db` in Task 4 applies every migration against an in-memory PGlite instance and will catch a syntax error or ordering problem regardless.)

- [ ] **Step 3: Add the type and label map to `src/types/project.ts`**

Add directly below the existing `PROJECT_TYPE_LABELS` block (after line 16):

```typescript
export type ProjectMethodology = "standard" | "scrum";

export const PROJECT_METHODOLOGY_LABELS: Record<ProjectMethodology, string> = {
  standard: "Standard",
  scrum: "Scrum",
};
```

Add `methodology: ProjectMethodology;` to the `Project` interface (after `project_type: ProjectType | null;` on line 30 — note `methodology` is NOT nullable, unlike `project_type`, since the DB column is `NOT NULL DEFAULT 'standard'`).

Add `methodology?: ProjectMethodology;` to both `CreateProjectData` (after line 47) and `UpdateProjectData` (after line 60).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (existing call sites that build a `Project` object from a DB row will still compile since they spread `...row` rather than listing every field explicitly — confirm this holds by checking the diagnostics list is unchanged from before this step).

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/029_project_methodology.sql src/types/project.ts
git commit -m "Add projects.methodology column and ProjectMethodology type"
```

---

### Task 2: Create-project form

**Files:**
- Modify: `src/app/organizations/[id]/create-project-dialog.tsx`
- Modify: `src/app/organizations/[id]/actions.ts`

- [ ] **Step 1: Add the "Workflow" field to `ProjectForm` in `create-project-dialog.tsx`**

Import the new type/labels alongside the existing ones (line 17):

```typescript
import { PROJECT_TYPE_LABELS, type ProjectType, PROJECT_METHODOLOGY_LABELS, type ProjectMethodology } from "@/types/project";
```

Add a constant next to `PROJECT_TYPE_OPTIONS` (after line 21):

```typescript
const PROJECT_METHODOLOGY_OPTIONS = Object.entries(PROJECT_METHODOLOGY_LABELS) as [
  ProjectMethodology,
  string,
][];
```

Insert this block into `ProjectForm`'s JSX, right after the "Project Type" `<div className="space-y-2">...</div>` block (after line 100, before the `{state.error && ...}` block):

```tsx
<div className="space-y-2">
  <Label>Workflow</Label>
  <div className="flex gap-4">
    {PROJECT_METHODOLOGY_OPTIONS.map(([value, label]) => (
      <label key={value} className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="methodology"
          value={value}
          defaultChecked={value === "standard"}
        />
        {label}
      </label>
    ))}
  </div>
  <p className="text-xs text-muted-foreground">
    Scrum adds sprints, backlog, and story points — coming soon. For now this
    just labels the project.
  </p>
</div>
```

- [ ] **Step 2: Validate and persist it in `createProject` (`actions.ts`)**

Add the import (alongside the existing `ProjectType` import at the top of the file):

```typescript
import type { ProjectMethodology, ProjectType } from "@/types/project";
```

Add a validation constant near the top-level `VALID_PROJECT_TYPES` (find it via `grep -n "VALID_PROJECT_TYPES" src/app/organizations/[id]/actions.ts`):

```typescript
const VALID_METHODOLOGIES: ProjectMethodology[] = ["standard", "scrum"];
```

After the existing `projectType` parsing block (the one that reads `formData.get("projectType")`), add:

```typescript
const methodologyRaw = formData.get("methodology");
let methodology: ProjectMethodology = "standard";
if (typeof methodologyRaw === "string" && methodologyRaw.trim()) {
  if (!VALID_METHODOLOGIES.includes(methodologyRaw as ProjectMethodology)) {
    return { error: "Invalid workflow." };
  }
  methodology = methodologyRaw as ProjectMethodology;
}
```

Update the `withUser` INSERT (the one starting `INSERT INTO projects (organization_id, name, slug, description, project_type, created_by)`):

```typescript
const result = await query(
  `INSERT INTO projects (organization_id, name, slug, description, project_type, methodology, created_by)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING id`,
  [orgId, name.trim(), slug, trimmedDescription, projectType, methodology, access.userId]
);
```

Update the Supabase `.insert({...})` call to add `methodology,` alongside the existing `project_type: projectType,` line.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors (the pre-existing 26 `no-explicit-any` lint errors in unrelated files are baseline and expected — confirm the count doesn't grow).

- [ ] **Step 4: Commit**

```bash
git add src/app/organizations/[id]/create-project-dialog.tsx src/app/organizations/[id]/actions.ts
git commit -m "Add Workflow (Standard/Scrum) selector to project creation"
```

---

### Task 3: Settings form + project-page badge

**Files:**
- Modify: `src/app/projects/[id]/settings/settings-form.tsx`
- Modify: `src/app/projects/[id]/settings/actions.ts`
- Modify: `src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Add the "Workflow" field to `settings-form.tsx`**

Update the import on line 21-22 to also bring in the new type/labels:

```typescript
import type { Project, ProjectStatus, ProjectType, ProjectMethodology } from "@/types/project";
import { PROJECT_TYPE_LABELS, PROJECT_METHODOLOGY_LABELS } from "@/types/project";
```

Add near `PROJECT_TYPE_OPTIONS` (line 30):

```typescript
const PROJECT_METHODOLOGY_OPTIONS = Object.entries(PROJECT_METHODOLOGY_LABELS) as [
  ProjectMethodology,
  string,
][];
```

Insert this block right after the "Project Type" `<div className="space-y-2">...</div>` (after line 145, before the "Project Color" block):

```tsx
<div className="space-y-2">
  <Label>Workflow</Label>
  <div className="flex gap-4">
    {PROJECT_METHODOLOGY_OPTIONS.map(([value, label]) => (
      <label key={value} className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="methodology"
          value={value}
          defaultChecked={project.methodology === value}
        />
        {label}
      </label>
    ))}
  </div>
  <p className="text-xs text-muted-foreground">
    Scrum adds sprints, backlog, and story points — coming soon. For now this
    just labels the project.
  </p>
</div>
```

- [ ] **Step 2: Validate and persist it in `updateProjectSettings` (`actions.ts`)**

Update the type import on line 14:

```typescript
import type { ProjectStatus, ProjectType, ProjectMethodology } from "@/types/project";
```

Add near the existing `VALID_PROJECT_TYPES` constant (line 22):

```typescript
const VALID_METHODOLOGIES: ProjectMethodology[] = ["standard", "scrum"];
```

After the existing `projectType` parsing block (lines 132-138), add:

```typescript
const methodologyRaw = formData.get("methodology");
let methodology: ProjectMethodology = "standard";
if (typeof methodologyRaw === "string" && methodologyRaw.trim()) {
  if (!VALID_METHODOLOGIES.includes(methodologyRaw as ProjectMethodology)) {
    return { error: "Invalid workflow." };
  }
  methodology = methodologyRaw as ProjectMethodology;
}
```

Update the `withUser` UPDATE query (lines 200-206):

```typescript
await query(
  `UPDATE projects
   SET name = $1, description = $2, status = $3, color = $4,
       avatar_url = COALESCE($5, avatar_url), project_type = $6, methodology = $7
   WHERE id = $8`,
  [name.trim(), trimmedDescription, status, trimmedColor, avatarUrl ?? null, projectType, methodology, projectId]
);
```

Update the Supabase `.update({...})` call (lines 223-230) to add `methodology,` alongside `project_type: projectType,`.

- [ ] **Step 3: Add the Scrum badge to the project page**

In `src/app/projects/[id]/page.tsx`, right after the existing project-type `Badge` block (the one guarded by `{project.project_type && (...)}`, around line 97-101), add:

```tsx
{project.methodology === "scrum" && <Badge variant="outline">Scrum</Badge>}
```

(`Badge` is already imported in this file for the project-type badge above it — confirm with `grep -n "^import.*Badge" src/app/projects/[id]/page.tsx` before assuming, and add the import if it's missing.)

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[id]/settings/settings-form.tsx src/app/projects/[id]/settings/actions.ts src/app/projects/[id]/page.tsx
git commit -m "Add Workflow selector to project settings and a Scrum badge to the project page"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check suite**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:db`
Expected: `tsc`/`build` clean; `lint` shows only the pre-existing 26 baseline errors (no new ones, no files touched by this plan appearing in the list); `test:db` prints `132 pass / 0 fail` or higher — migration 029 gets exercised as part of the chain PGlite applies, so a typo in the SQL fails this step, not silently.

- [ ] **Step 2: Manual browser check**

Start the dev server, then:
1. Create a project, picking "Scrum" in the Workflow field. Confirm the project page shows a "Scrum" badge next to the name.
2. Create a second project leaving "Standard" selected (the default). Confirm no badge appears.
3. Open the first project's Settings, switch Workflow to "Standard", save, reload the project page. Confirm the badge disappears.
4. Open Settings again, switch back to "Scrum", save, reload. Confirm the badge reappears.

Expected: all four steps behave as described, with no console errors.

- [ ] **Step 3: If everything above passes, this plan is complete — proceed to superpowers:finishing-a-development-branch on the worktree branch.**
