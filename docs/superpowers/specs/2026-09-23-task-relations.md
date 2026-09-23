# Task relations ("related to")

**Status:** approved by user (2026-09-23). Design confirmed directly through three clarifying questions: (1) a simple, symmetric, untyped "related to" link rather than typed/directional dependencies (blocks/depends-on); (2) same-project only, not cross-project; (3) surfaced only in the task detail dialog, no Kanban card indicator.

**Origin:** Guidon backlog task "Dodanie prezentów Tasków" (id `1157bcf9-dddc-4707-a227-a2040c348c90`) - the title is a typo/transcription error; the real request, confirmed with the user, is task-to-task relations: "Można dodawać kilka Tasków które są ze soba połączone" (you can link several tasks together).

## What exists already (precedent to mirror)

- `task_comments` (migration 001) and `task_attachments` (migration 041, this session's own recent work) are both child tables with `task_id` as their only link back to a project (no `project_id` column of their own - derived via a join through `tasks`), with RLS that re-derives project membership through that join. `task_relations` follows the exact same shape.
- Subtasks (`parent_task_id` on `tasks` itself, migration 010) are the existing "tasks reference other tasks" mechanism, but that's a strict one-parent hierarchy - not applicable here, since a relation is symmetric and a task can relate to any number of other tasks with no hierarchy.
- `src/app/projects/[id]/work/attachments-actions.ts` is the structural template for the new Server Actions file: `hasDirectDatabase()` branching, every mutation scoped by `id AND task_id`, `RETURNING`/`.select()` rowcount checks before treating a mutation as successful.
- `src/components/work/task-attachments-section.tsx` is the structural template for the new UI section: self-contained, loads its own data on mount, doesn't touch the parent dialog's form state.
- Checked for conflicts with the heavy concurrent multi-session activity on this repo today (Unity/Unreal/Blender/Godot/JetBrains/VS Code plugins, GitHub integration, AI chat tools): `git log --all` has nothing touching task relations/links/dependencies. The next free migration number is `043` (`042_github_task_events.sql` already exists from that concurrent work).

## Data model (migration 043)

```sql
CREATE TABLE public.task_relations (
    id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id          uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    related_task_id  uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT task_relations_ordered_pair CHECK (task_id < related_task_id),
    CONSTRAINT task_relations_unique_pair UNIQUE (task_id, related_task_id)
);
```

Both `task_id` and `related_task_id` cascade-delete: a relation has no meaning once either side of the pair is gone, matching `task_comments`'/`task_attachments`' own single-sided cascade, just doubled since this table has two task references instead of one.

`task_id < related_task_id` (UUID text comparison) is enforced by a `CHECK` constraint, not just convention - the INSERT path (Server Action) is responsible for sorting the two ids before insert so the constraint never fails on a legitimately-requested link created in either order (linking A→B or B→A from the UI both produce the same stored row). This makes the relation inherently symmetric and prevents `(A,B)` and `(B,A)` ever existing as two separate rows for the same pair - a single `UNIQUE` constraint on the ordered pair is then sufficient to prevent duplicates, and a single row answers "is A related to B" regardless of which order the user picked them in.

No `project_id` column - derived via `task_id`'s (or `related_task_id`'s - both are guaranteed same-project by the INSERT check below) own `project_id`, same as `task_comments`/`task_attachments`.

### RLS policies

- **SELECT**: any project member can see a relation involving a task in their project - `EXISTS (SELECT 1 FROM tasks t WHERE (t.id = task_relations.task_id OR t.id = task_relations.related_task_id) AND private.project_access(t.project_id))`.
- **INSERT**: comment-tier roles (owner/admin/developer/tester), matching `task_comments_insert`'s tier exactly - `WITH CHECK` requires BOTH `task_id` and `related_task_id` resolve to the SAME `project_id`, and that the inserting user has an appropriate role in that project. This is the one point that must be a real database-level check, not just an app-level one: the "same project only" rule (confirmed with the user as a hard requirement) must hold even against a malformed or malicious direct API call, not just the UI's own task picker.
- **DELETE**: same comment-tier as INSERT (owner/admin/developer/tester) - no author-only or broader-admin-only restriction, since a relation has no personal-ownership concept the way a comment (author-only delete) or attachment (uploader-or-admin delete) does. Any project member who could create a relation can remove one.
- `GRANT SELECT, INSERT, DELETE ON public.task_relations TO authenticated`.

## Server Actions (new file: `src/app/projects/[id]/work/relations-actions.ts`)

- `loadTaskRelations(projectId, taskId)`: returns the OTHER task's summary (id, title, status) for every relation row involving `taskId`, joining against `tasks` to get the related task's display fields (not just its id) - both `hasDirectDatabase()` branches.
- `addTaskRelation(projectId, taskId, relatedTaskId)`: checks `canCommentOnProject` (matching the RLS insert tier), rejects if `taskId === relatedTaskId` (a task can't relate to itself - an app-level check backing up the fact that the DB `CHECK (task_id < related_task_id)` would already reject equal ids, but a clear error message is better than a raw constraint-violation surfacing to the user), sorts the two ids before insert so the ordering constraint is satisfied regardless of which task the user picked from, inserts with `created_by = access.userId`.
- `removeTaskRelation(projectId, taskId, relationId)`: scoped delete `WHERE id = $1 AND (task_id = $2 OR related_task_id = $2)` (never trusting a client-supplied pair, and matching this codebase's own recurring-bug-class fix pattern of scoping every mutation by more than just its own `id`), checks rowcount before treating it as success.
- `searchProjectTasks(projectId, query, excludeTaskId)`: for the "pick a task to relate" combobox - returns up to ~20 matching tasks (by title, case-insensitive) in the same project, excluding the current task itself and any task already related to it (so the picker doesn't offer a duplicate).

No `logActivity`/activity-feed entry for relation add/remove - a deliberate scope cut, since this is a lightweight organizational link, not an action worth surfacing in the project activity feed the way a status change, comment, or attachment is (matches the spirit of not treating every mutation as feed-worthy).

## UI (`src/components/work/task-relations-section.tsx`, wired into `task-detail-dialog.tsx`)

Positioned next to `TaskAttachmentsSection` in the dialog. Self-contained, same load-on-mount pattern:
- A list of currently related tasks (title, a small status-colored dot/badge matching the board's own status colors, a remove button gated by `canEdit` matching the tier `TaskAttachmentsSection` already uses for its own gating).
- Clicking a related task's title switches the currently-open detail dialog to that task (re-using whatever mechanism already lets `WorkBoard`/`CalendarView` open a task by id - read `task-detail-dialog.tsx`'s actual open/close wiring before implementing this, since "jump to another task's detail view from inside the current one" is new interaction this dialog hasn't needed before).
- A combobox/search input (gated by `canEdit`) that calls `searchProjectTasks` as the user types (debounced), showing matching tasks; selecting one calls `addTaskRelation` and adds it to the list optimistically, reconciled on the server response.

## i18n

New `work.relatedTasks*` keys (section title, search placeholder, empty state, remove-button aria label, error messages) across all four `messages/*.json` files, same process as every other i18n addition this session.

## Non-goals

Relation types/direction (blocks, depends-on, duplicates) - a flat "related to" only. Cross-project relations. A Kanban card indicator/badge for related-task count. An activity-feed entry for relation changes. Bulk-linking multiple tasks in one action (the description's "przez jakieś listy" is satisfied by the search/pick UI, one relation added at a time).

## Testing

`tests/db/compat.test.mjs` new section: RLS checks mirroring `task_attachments`' own section - a non-member can't see/insert a relation, a comment-tier member can create one, the ordered-pair `CHECK` constraint accepts either insert order and produces one row, the `UNIQUE` constraint rejects a duplicate, a cross-project insert attempt is rejected by the RLS `WITH CHECK` (not just app code), a member can delete a relation they didn't create, `ON DELETE CASCADE` behavior when either task in a relation is deleted (needs an FK on both `task_id` and `related_task_id` to `tasks(id) ON DELETE CASCADE`, not stated above but required - added here in the self-review pass below). `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus a real browser pass against the PGlite harness (add two tasks, relate them, confirm both directions show the relation, remove it, confirm both sides update).
