# Project methodology: Standard vs Scrum (part 1 of 3)

## Problem

Guidon has no concept of project methodology — every project works the
same way (a single Kanban board, roadmap phases). The user wants to be
able to mark a project as following Scrum instead, eventually gaining
sprints, a backlog, story points, and a burndown chart. That full scope
is too large for one round, so it's split into three sequential
pieces:

1. **This round**: the `methodology` field itself — selectable when
   creating a project, editable afterward, displayed on the project
   page. No sprint/backlog/story-point behavior yet.
2. A later round: sprint management (create/start/complete sprints,
   backlog vs. sprint board views, story points on tasks).
3. A later round: a burndown/progress chart for the active sprint.

This spec covers only part 1.

## Design

### Data model

New migration, `src/db/migrations/029_project_methodology.sql`:

```sql
ALTER TABLE projects ADD COLUMN methodology text NOT NULL DEFAULT 'standard'
  CHECK (methodology IN ('standard', 'scrum'));

REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (name, description, status, color, allow_ai_auto_complete, avatar_url, project_type, methodology)
    ON public.projects
    TO authenticated;
```

No new RLS *policy* is needed — `methodology` is a plain column on
`projects`, already covered by that table's existing SELECT/UPDATE
policies, the same way the `avatar_url` column added in migration 018
needed no policy of its own. **But** migrations 014/017/018/023
narrowed `GRANT UPDATE` on `projects` to an explicit column allowlist
(a self-elevation guard — see 023's own comment), so the new column
must be added to that list in this same migration, or every settings
save will fail with "permission denied" despite passing RLS, exactly
as 023's own warning comment says. The list above is the current one
as of migration 023 (confirmed no later migration touches it) plus
`methodology`.

### Naming

The field is called `methodology`, kept deliberately separate from
the existing `project_type` column (`game | website | mobile_app | api
| tool | other` — an unrelated category tag defined in
`src/types/project.ts`). In the UI it's labeled "Workflow" to avoid
being confused with the "Project Type" dropdown that already sits
next to it in the same forms.

### Types (`src/types/project.ts`)

```typescript
export type ProjectMethodology = "standard" | "scrum";

export const PROJECT_METHODOLOGY_LABELS: Record<ProjectMethodology, string> = {
  standard: "Standard",
  scrum: "Scrum",
};
```

Added to `Project` as `methodology: ProjectMethodology` (NOT NULL,
matches the DB default), and to `CreateProjectData`/`UpdateProjectData`
as `methodology?: ProjectMethodology`.

### Create flow

`src/app/organizations/[id]/create-project-dialog.tsx` gains a
"Workflow" radio group (Standard / Scrum, Standard pre-selected) in
`ProjectForm`, with helper text under it: "Scrum adds sprints,
backlog, and story points — coming soon." This exists so picking
Scrum today doesn't look broken when nothing else visibly changes yet
— it only sets the flag for now.

`createProject` in `src/app/organizations/[id]/actions.ts` reads
`formData.get("methodology")`, validates it against
`['standard', 'scrum']` the same way `projectType` is already
validated (defaulting to `'standard'` if absent/empty, since the DB
column itself also defaults there), and passes it through both
dual-mode branches (the `withUser` raw-SQL INSERT and the Supabase
`.insert()` call).

### Settings

`src/app/projects/[id]/settings/settings-form.tsx` gets the same
"Workflow" radio group so methodology can be changed after creation.
`updateProjectSettings` in
`src/app/projects/[id]/settings/actions.ts` validates and writes it
through both dual-mode branches (`withUser` raw-SQL UPDATE and the
Supabase `.update()` call), the same way `projectType` already is
there.

No restriction on switching between Standard and Scrum in either
direction for this round — there's no sprint data yet for a
switch to orphan or invalidate. Part 2 will need to decide what
happens to an existing project's sprints if it's switched back to
Standard; out of scope here.

### Display

`src/app/projects/[id]/page.tsx` (around the existing project-type
badge at line 97) gets a small "Scrum" badge, shown only when
`project.methodology === "scrum"` — mirrors how the project-type badge
already only renders when set. Standard projects show no badge (it's
the unremarkable default), so this is one line of new JSX, not a new
component.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `npm run test:db` — no RLS change, but a schema change touches the
  migration chain, so this must still pass at the same-or-higher pass
  count (132).
- Manual: create a project with each Workflow option in the browser,
  confirm the badge appears only for Scrum, confirm changing it later
  in settings persists and updates the badge.

## Out of scope

- Sprints, backlog view, story points, burndown chart (parts 2 and 3).
- Any behavior change to the Kanban board or roadmap for Scrum
  projects — this round is metadata only.
- Restricting or migrating data when a project's methodology changes
  after sprints exist (not applicable yet — no sprint data exists
  until part 2 ships).
