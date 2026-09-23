# Task relations ("related to")

**Status:** approved by user (2026-09-23), then substantially revised after implementation research and re-confirmed. Original design (a new `task_relations` table + RLS) was scrapped once research showed the generic relations mechanism already exists and covers everything needed - see "What already exists" below. The revised, much smaller design reuses that mechanism entirely; user confirmed this replaces the original plan.

**Origin:** Guidon backlog task "Dodanie prezentów Tasków" (id `1157bcf9-dddc-4707-a227-a2040c348c90`) - the title is a typo/transcription error; the real request, confirmed with the user, is task-to-task relations: "Można dodawać kilka Tasków które są ze soba połączone" (you can link several tasks together), added via a search/list picker rather than typing an id.

Confirmed via clarifying questions before research began: (1) a simple, symmetric, untyped "related to" link, not typed/directional dependencies (blocks/depends-on); (2) same-project only; (3) surfaced in the task detail dialog. All three are already true of the existing mechanism (point 1 via `relation_type = 'related_to'`, one of eleven values the table already supports; point 2 already enforced in RLS itself, not just app code; point 3 is the one actual gap - the existing UI is a separate "Graf" page with a raw-UUID form, not inside the task dialog).

## What already exists (do not rebuild any of this)

Guidon has a generic, working, RLS-secured context-graph relation system, already covering task↔task `related_to` links completely at the data layer:

- **Table** `context_relations` (`src/db/migrations/000_baseline_schema.sql`, `project_id` added by migration 011 via trigger): `id, source_type, source_id, target_type, target_id, relation_type, metadata, created_at, created_by`. `relation_type` is a `CHECK`-constrained enum already including `'related_to'` (plus `depends_on`, `blocks`, `implements`, `references`, `decided_by`, `based_on`, `contradicts`, `supersedes`, `part_of`, `contains` - not used by this feature). `source_type`/`target_type` are `ContextEntityType` (`project | task | phase | decision | file | source | memory`).
- **RLS** (`001_initial_schema.sql`): `context_relations_select` - any project member (via `private.entity_project_id(source_type, source_id)` resolving to a project the user can access). `context_relations_insert` - `created_by = auth.uid()` AND `private.entity_project_id(source) = private.entity_project_id(target)` (this is where "same project only" is ALREADY enforced at the database level, for every entity type pair, not just tasks) AND `private.project_role(...) IN ('owner','admin','developer')`. `context_relations_delete` - `private.project_role(...) IN ('owner','admin')`. **This feature must use these tiers as-is, not invent a different one** - creating a relation needs owner/admin/developer (NOT tester, unlike the comment-tier used by `task_comments`/`task_attachments`), deleting needs owner/admin only.
- **Server Actions** (`src/app/projects/[id]/context/actions.ts`): `createRelation(projectId, prevState, formData)` (reads `source_type`/`source_id`/`target_type`/`target_id`/`relation_type` from `FormData`, validates against the known enums, inserts) and `deleteRelation(projectId, relationId)` (scoped `WHERE id = $1 AND project_id = $2`, rowcount-checked). Both already handle the `hasDirectDatabase()` branch. **Reused directly, unmodified, by this feature** - `createRelation` is called from the new UI with a manually-constructed `FormData` (`source_type: "task", source_id: <this task>, target_type: "task", target_id: <picked task>, relation_type: "related_to"`), not by writing a new insert path.
- **Label resolution** (`src/lib/context/entity-label.ts`): `resolveEntityLabels(userId, refs: {type, id}[])` batch-resolves a display label (task title, for `type: "task"`) for a set of entity refs, RLS-respecting, already used by the existing relation list.
- **Existing UI precedent** (`src/app/projects/[id]/context/{create-relation-dialog,relation-row}.tsx`): shows the display pattern (badge for type, resolved label, relation-type label, delete button) this feature's own list borrows the visual shape of, though the new UI is task-scoped and adds a search picker instead of raw id text inputs.

## What's actually missing (the real scope of this feature)

1. A way to see, for ONE specific task, its related tasks (title + status) without navigating to the separate Graf page - i.e. a task-scoped read that resolves BOTH directions (`source_id = taskId` and `target_id = taskId`, since a relation is symmetric in meaning but stored with an arbitrary source/target assignment based on which task the user started from).
2. A search-by-title picker to find another task in the same project to link to - the existing dialog only offers a plain text `<Input>` for a raw UUID.
3. Wiring both into the task detail dialog as a new section, and (a small UX nicety carried over from the original design) letting a click on a related task's title jump the currently-open dialog to that task.

## New Server Actions (new file: `src/app/projects/[id]/work/relations-actions.ts`)

```ts
export type RelatedTask = { relationId: string; id: string; title: string; status: string };
```

- `loadTaskRelatedTasks(projectId, taskId): Promise<{ relations: RelatedTask[]; error: string | null }>` - queries `context_relations` for rows where `relation_type = 'related_to'` AND (`source_type = 'task' AND source_id = taskId` OR `target_type = 'task' AND target_id = taskId`), both `hasDirectDatabase()` branches. For each row, the "other" task's id is whichever of `source_id`/`target_id` isn't `taskId`; batch-fetch those tasks' `id, title, status` from `tasks` (a single `WHERE id = ANY($1)` query, RLS-scoped via `withUser`/the Supabase client same as every other read in this app) and zip them back onto each relation's id.
- `searchProjectTasksByTitle(projectId, query, excludeIds): Promise<{ tasks: {id: string; title: string}[]; error: string | null }>` - checks `getProjectAccess`, `ilike`/`ILIKE '%query%'` on `tasks.title` scoped to `project_id`, excluding `excludeIds` (the current task plus every already-related task id, so the picker never offers a duplicate), capped at 20 results. Mirrors the task-search query shape already used in `src/app/api/v1/search/route.ts` (session-authenticated here via `getProjectAccess` instead of that route's API-key auth).
- Both re-export `createRelation`/`deleteRelation` from `../context/actions` unmodified (`export { createRelation, deleteRelation } from "../../context/actions";`) so the UI component only imports from one file - a thin convenience, not a reimplementation.

No new migration. No new RLS. No `logActivity` entry for relation add/remove (a deliberate scope cut, same reasoning as the original design: a lightweight organizational link isn't feed-worthy the way a status change or comment is - and the existing Graf-page relation actions don't log activity either, so this stays consistent with established behavior for this table).

## UI

**New component** `src/components/work/task-relations-section.tsx`, wired into `task-detail-dialog.tsx` next to `TaskAttachmentsSection`:
- Loads via `loadTaskRelatedTasks` on mount (same self-contained pattern as `TaskAttachmentsSection`).
- Lists related tasks: title, a small status-colored dot (reusing whatever status-color mapping `task-card.tsx` already uses - don't invent a second one), a remove button that calls `deleteRelation(projectId, relationId)` directly, gated on the dialog's existing `canDelete` prop (already exactly owner/admin, matching the RLS tier).
- A search input (gated on the dialog's existing `canEdit` prop - already exactly owner/admin/developer, matching `context_relations_insert`'s tier) that calls `searchProjectTasksByTitle` as the user types (debounced ~300ms), shows matches, and on picking one, constructs a `FormData` and calls `createRelation(projectId, {error: null}, formData)` directly (as a plain async function call, not via `useActionState`, since this UI wants an immediate list update rather than a full form-submission flow) with `source_type: "task", source_id: task.id, target_type: "task", target_id: <picked>, relation_type: "related_to"`.
- Clicking a related task's title calls a new `onNavigateToTask?: (taskId: string) => void` prop (threaded down from `TaskDetailDialog`'s own new optional prop of the same name) rather than any routing - `work-board.tsx` and `calendar-view.tsx` (the two places that render `<TaskDetailDialog>`) both already hold the full task list in state for `upsertTask`/`removeTask`, so they implement it as `(taskId) => { const target = tasks.find(t => t.id === taskId); if (target) setOpenTask(target); }`. If a caller doesn't pass this prop, the title simply isn't a link (plain text) - graceful degradation, not a hard requirement to wire into every future call site.

## Permission tiers

Confirmed by reading `src/lib/data/project-access.ts` and `work-board.tsx` directly (not assumed): `canEdit` (`= canWriteProject(role)` = `role IN (owner, admin, developer)`) matches `context_relations_insert`'s RLS tier exactly, and `canDelete` (`= role IN (owner, admin)`, `work-board.tsx:76`) matches `context_relations_delete`'s tier exactly. **No new permission derivation is needed** - gate the search/create UI on the dialog's existing `canEdit` prop and the remove button on its existing `canDelete` prop, both already threaded into `TaskDetailDialog` today.

## i18n

New `work.relatedTasks*` keys (section title, search placeholder/hint, empty state, remove-button aria label, "no matches" state, error messages) across all four `messages/*.json` files, same process as every other i18n addition this session.

## Non-goals

Relation types/direction in the UI (the picker always creates `related_to` - other types stay Graf-page-only for now). Cross-project relations. A Kanban card indicator/badge for related-task count. An activity-feed entry for relation changes. Any change to the existing Graf page, `create-relation-dialog.tsx`, or `relation-row.tsx` - this feature adds a second, task-scoped entry point to the same underlying data, it doesn't touch the existing generic one.

## Testing

No new migration, so no new RLS compat-test section is needed for permissions - confirmed `tests/db/compat.test.mjs` already has sections 10 ("context_relations.project_id", migration 011) and 11 ("sprzatanie sierot context_relations", migration 012) exercising this table's insert/cleanup behavior; extending that coverage further is outside this feature's scope. This feature's own testing is: `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus a real browser pass against the PGlite harness - create two tasks in the same project, open one, search for and link the other, confirm it appears in both tasks' "Related tasks" lists (open the second task and confirm the first shows up too - proving the bidirectional OR-query works regardless of which task was the `source`), click the related task's title and confirm the dialog switches to it, remove the relation from either side, confirm it disappears from both.
