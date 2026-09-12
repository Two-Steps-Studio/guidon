# Subtasks: editable status table (1 of 4 planning-UX improvements)

This is the first of four planning-focused improvements requested in one
sitting (subtask table, deadline visibility, board filtering, bulk task
actions). Each gets its own spec → plan → implementation cycle; this spec
covers only the subtask table.

## Problem

Subtasks (migration 010) are already plain rows in `tasks` with
`parent_task_id` set, carrying the full `TaskStatus` enum
(`backlog | todo | in_progress | ai_working | review | done`) — the same
vocabulary the main board uses. But the "Subtasks" section in
`src/components/work/task-detail-dialog.tsx` only exposes a binary
checkbox (done/not done) via `toggleSubtask`, which collapses that status
to just `todo`/`done`. There is also no way to rename a subtask after
creating it — `handleAddSubtask` is the only write path to a subtask's
title.

The user wants a subtask row to move through the same intermediate states
as a real task (in particular "review" — a state that already exists in
the enum but was unreachable from the subtask UI) and to be able to edit a
subtask's title after creation, without leaving the task detail dialog.

## Design

### No schema change

Subtasks are already full `tasks` rows with a real `status` column and
already-audited, correctly project-scoped mutations
(`createSubtask`, `updateTask`, `deleteTask` — all fixed earlier this
session to check rowcount/`project_id`). This feature is UI-only plus one
small backend simplification; no migration.

### Retire `toggleSubtask`, use `updateTask` directly

`toggleSubtask(projectId, subtaskId, done: boolean)` in
`src/app/projects/[id]/work/actions.ts` is only ever called from
`task-detail-dialog.tsx` (confirmed via grep — the one other match, in
`context/actions.ts`, is a comment, not a call). Once the UI needs to set
an arbitrary `TaskStatus` rather than a boolean, `toggleSubtask` has no
remaining reason to exist alongside the already-correct, general-purpose
`updateTask(projectId, subtaskId, { status })` — keeping both would mean
two code paths doing the same row update with different scoping logic to
keep in sync. `toggleSubtask` is deleted; the dialog calls
`updateTask(projectId, subtaskId, { status })` for status changes and
`updateTask(projectId, subtaskId, { title })` for title edits. Both go
through the same permission check (`canWriteProject`) and RLS
(`tasks_update`) subtasks already satisfy today.

### UI: checklist → table

In `task-detail-dialog.tsx`'s "Subtasks" section, each subtask row
becomes:

- **Title** — a plain `<Input>` bound to local per-row edit state,
  committed via `updateTask` on blur or Enter (not on every keystroke).
  Reverts to the last saved value on Escape. No separate "Save" button —
  matches the existing immediate-commit pattern subtasks already use for
  add/delete.
- **Status** — a `<Select>` populated from the same `columns` prop the
  parent task's own status field already uses (project-configurable via
  migration 020's column overrides), so a subtask's status dropdown always
  matches whatever statuses this project has enabled/relabeled. Commits
  immediately `onChange` via `updateTask`.
- **Delete** — unchanged (`deleteTask`, already fixed).

The "Add a subtask…" input/form at the bottom is unchanged; new subtasks
still default to `status: "todo"`.

The existing progress counter (`x/y done`) keeps working unchanged — it
already keys off `status === "done"` via `isDone()`.

### Error handling

Each row gets its own busy/error affordance, mirroring the existing
per-subtask `togglingSubtaskId`/`deletingSubtaskId` state pattern
(generalized to cover title-saving and status-changing too) so one row's
in-flight save can't block interaction with the others. A failed save
(e.g. `updateTask` returning `{ error }` because the subtask was deleted
in another tab) surfaces inline near that row and leaves the field
reverted to its last known-good value rather than the UI silently keeping
an unsaved edit.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `npm run test:db` (no schema/RLS change expected, but `updateTask` is
  RLS-adjacent — run it to confirm nothing regresses).
- Manual/browser check: open a task with subtasks, add a subtask, rename
  it, move it through backlog → todo → in progress → review → done via
  the dropdown, delete it — confirm the progress counter and board's
  subtask-count badge (`work-board.tsx`'s `subtaskCounts`) update
  correctly.

## Out of scope

- The other three planning improvements (deadline visibility, board
  filters, bulk task actions) — separate specs, in that order, after this
  one ships.
- Any change to the main task's own status/title editing UX (the
  form-plus-Save-button pattern stays as-is for the parent task; only the
  subtask rows switch to immediate-commit).
- Reordering subtasks (no drag handle, no `sort_order` UI) — not
  requested, and subtasks are already ordered by creation via whatever
  `groupSubtasksByParent` currently does.
- Notification/reminder behavior tied to subtask status changes (belongs
  to the deadline-visibility phase, not this one, and is explicitly
  visual-only per the user's answer to that question).
