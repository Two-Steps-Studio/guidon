# Board: sort by due date (2 of 4 planning-UX improvements)

Second of four planning-focused improvements (subtask table — shipped;
deadline visibility — this spec; board filters; bulk task actions).

## Problem

The work board already shows a per-card due-date indicator (colored
text + calendar icon, `dueState()`/`DUE_STATE_CLASSES` in
`src/lib/work/task-board.ts`, rendered by `TaskCard`) — confirmed with
the user this part is not missing. What's missing, confirmed with the
user as the actual gap: **no way to see a column ordered by nearest
deadline** — cards only ever order by manual drag position
(`sort_order`, via `compareTasks()`).

## Design

### One board-wide toggle, not per-column

A single control in `WorkBoard`'s header switches the whole board
between **Manual** (today's behavior, unchanged) and **Due date**
(every column re-sorted by nearest deadline). One mental model for the
whole board is simpler to understand at a glance than an independent
per-column state, and nothing about the request implied wanting mixed
sort modes across columns.

Visible to every viewer, including read-only roles — this is a display
preference, not an edit action, so it isn't gated by `canEdit`.

State lives in a plain `useState` in `WorkBoard` (default `"manual"`),
not persisted to `localStorage` or the database: it resets to Manual on
reload/navigation. Deliberately simple — no SSR/hydration concerns, no
new column, no per-user preference row.

### Sorting: a second comparator, not a parallel data path

`src/lib/work/task-board.ts`'s `groupTasksByStatus(tasks)` currently
hard-codes `compareTasks` as the sort. It gains an optional second
parameter:

```typescript
export function groupTasksByStatus(
  tasks: Task[],
  compare: (a: Task, b: Task) => number = compareTasks
): TasksByStatus
```

A new `compareTasksByDueDate(a, b)` sits next to `compareTasks`:
dated tasks sort ascending by due date (soonest first); a task with no
`due_date` always sorts after every dated task; two tasks that tie
(both undated, or the same date) fall back to `compareTasks(a, b)` so
their relative order still matches today's manual/priority ordering
rather than becoming arbitrary. No new grouping function, no
duplicated loop — `KanbanBoard` just passes a different comparator
through.

### Dragging is disabled while sorted by due date

When the board is in **Due date** mode, cards are not draggable and
the keyboard reorder shortcut (Alt+Up/Down) is unavailable — mirrors
how `canEdit=false` already disables both today. Reasoning: a
position a user drags a card to would be silently overwritten by the
due-date sort on the very next render, which is a worse experience
than making the constraint explicit. Moving a task to a different
status while sorted by due date still works — through the task detail
dialog's status dropdown (already independent of drag-and-drop) — just
not by dragging it to another column. This is a real, acknowledged
trade-off: switch back to Manual to drag again.

### UI

A `<Select>` (same primitive already used for Status/Priority
elsewhere in this file) in `WorkBoard`'s header, between the project
progress text and the "New task" button:

```tsx
<Select
  aria-label="Sort board by"
  className="h-8 w-40"
  value={sortMode}
  onChange={(event) => setSortMode(event.target.value as "manual" | "due_date")}
>
  <option value="manual">Manual order</option>
  <option value="due_date">Due date</option>
</Select>
```

`KanbanBoard` gains a `sortMode: "manual" | "due_date"` prop (default
`"manual"`), used to (a) pick the comparator passed to
`groupTasksByStatus`, and (b) gate `draggable`/`onReorder` on
`TaskCard` alongside the existing `canEdit` check (`canEdit &&
sortMode === "manual"`).

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- No RLS/schema change, so `npm run test:db` is optional but cheap to
  run for confidence.
- Manual/browser check: toggle to Due date, confirm each column
  reorders by nearest deadline with undated tasks last; confirm cards
  are no longer draggable and Alt+Up/Down does nothing while active;
  confirm changing a task's status via the detail dialog still works;
  toggle back to Manual, confirm the original drag-based order is
  exactly what it was before (nothing was mutated while sorted by due
  date).

## Out of scope

- Board filters and bulk task actions — the remaining two planned
  improvements, separate specs.
- Per-column independent sort state.
- Persisting the sort-mode choice (localStorage or otherwise).
- Any change to the per-card due-date indicator itself (color, icon,
  thresholds) — already shipped, not part of this gap.
- A due-soon/overdue count badge on column headers — considered and
  explicitly not requested when the user narrowed scope to sorting
  only.
- Making cross-column drag (status change) recompute anything
  due-date-aware — it simply appends nothing further; the destination
  column's own next re-render re-sorts by due date regardless of where
  visually dropped, since dropping is disabled entirely in this mode.
