# Board: quick filters by assignee/priority/tag (3 of 4 planning-UX improvements)

Third of four planned improvements (subtask table — shipped; sort by
due date — shipped; board filters — this spec; bulk task actions).

## Problem

The work board has no way to narrow down what's shown — confirmed via
grep that no filter/search UI exists anywhere in `src/components/work`
or `src/app/projects/[id]/work` (the only `filter` hits are internal
array `.filter()` calls, not a feature). On a board with many tasks,
finding "what's assigned to me" or "everything tagged X" means
scanning every column by eye.

## Design

### Three independent quick filters, AND-combined

A filter bar in `WorkBoard`'s header area: **Assignee** (All + each
project member), **Priority** (All + `low`/`medium`/`high`/`critical`),
**Tag** (All + every distinct tag actually used by a top-level task in
this project). A card is visible only when it matches every filter
that's currently set to something other than "All" — three
independent constraints ANDed together, not a single combined search
box.

**Status is deliberately not a filter dimension** — status is already
the board's column axis; hiding a status would just mean hiding a
whole column, which isn't what was asked for and isn't this spec's
scope.

### Client-side only, no backend change

`WorkBoard` already holds every top-level task in local state
(`topLevelTasks`, derived from `state.tasks`). Filtering derives a
further `filteredTasks` list from it via the three active filter
values and passes *that* to `KanbanBoard` instead of the unfiltered
list — no new Server Action, no query change, no schema change.

### Progress header stays project-wide; column counts reflect what's visible

The existing "`X/Y done (Z%)`" text in `WorkBoard`'s header
(`boardProgress(topLevelTasks)`) continues to summarize *all* tasks,
filtered or not — it's a project-level stat, not a view-level one,
and changing it based on an active filter would make "done" jump
around in a way that has nothing to do with progress. Each column's
own task-count badge in `KanbanBoard`, however, should reflect the
*filtered* set, since "3 tasks in Todo" is only useful information
when it means "3 visible tasks" — it already updates automatically
once `KanbanBoard` receives the filtered list instead of the full one,
no extra code needed there.

### Distinguish "no tasks" from "no tasks match the filters"

`KanbanBoard`'s existing empty-column state (`column.hint`, e.g. "Ready
to pick up") is shown today whenever a column has zero tasks — that's
right when the column is genuinely empty, but would be misleading
during a filter that hides every task in an otherwise non-empty
column ("looks empty" reads as "nothing planned here" when the truth
is "3 things planned here, none match your filter"). `KanbanBoard`
needs to know whether a filter is currently active (not just whether
the column is empty) to pick the right message.

### Clear filters

A "Clear filters" affordance appears next to the three selects,
visible only when at least one filter is set to something other than
"All" — resets all three to "All" in one click.

### State: plain view state, not persisted

Same choice as the sort-mode toggle from the previous round: three
`useState`s in `WorkBoard` (or one small state object), default "All",
reset on reload/navigation. No `localStorage`, no database column.

### Interaction with sort mode

Filtering and the existing Manual/Due-date sort toggle are
independent and compose: the filtered list is what gets grouped and
sorted (by whichever comparator sort mode currently selects), not the
other way around.

### UI placement

A new row (or wrapping flex row) below `WorkBoard`'s existing
`<header>`, above the error banner and the board itself — visible to
every viewer regardless of `canEdit` (filtering, like sort mode, is a
read-only view preference). Reuses the existing `<Select>` primitive
for Assignee/Priority/Tag, consistent with the sort-mode control
already shipped in this same header area.

### Verification

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- No RLS/schema change, so `npm run test:db` is optional but cheap to
  run for confidence.
- Manual/browser check: set each filter individually and in
  combination, confirm only matching cards show and column counts
  update; confirm the project-wide progress text does *not* change
  when filtering; confirm a filtered-to-empty column shows the
  "no tasks match" message rather than its normal empty-state hint;
  confirm "Clear filters" resets all three and only appears when a
  filter is active; confirm filtering composes correctly with the
  Manual/Due-date sort toggle from the previous round.

## Out of scope

- Bulk task actions — the fourth and final planned improvement,
  separate spec.
- A status/column-visibility filter (considered and explicitly
  declined — status is the column axis already).
- Free-text/keyword search across title or description.
- Persisting filter selections (localStorage, URL query params, or
  otherwise).
- Any change to `boardProgress()`'s inputs or meaning.
- Any change to the per-card rendering (`TaskCard`) itself, or to the
  Manual/Due-date sort feature shipped in the previous round.
