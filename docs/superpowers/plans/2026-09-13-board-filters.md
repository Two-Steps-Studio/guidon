# Board Quick Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three independent, AND-combined quick filters (assignee, priority, tag) to the work board, so a board with many tasks can be narrowed down without scrolling every column by eye.

**Architecture:** Pure client-side view state in `WorkBoard` — three `useState` filters derive a `filteredTasks` list from the already-loaded `topLevelTasks`, passed to `KanbanBoard` instead of the unfiltered list. `KanbanBoard` gains a `filtersActive` flag so an empty column can say "no tasks match the filters" instead of its normal empty-state hint. No schema change, no new Server Action, no persistence — same pattern as the sort-mode toggle shipped in the previous round.

**Tech Stack:** Next.js/React client components, no new dependencies.

Reference spec: `docs/superpowers/specs/2026-09-13-board-filters-design.md`

---

### Task 1: Add the three filters, wire `filteredTasks`/`filtersActive` through the board

**Files:**
- Modify: `src/app/projects/[id]/work/work-board.tsx` (imports, state, derived filtering, header UI, prop passthrough)
- Modify: `src/components/work/kanban-board.tsx` (new `filtersActive` prop, empty-state message)

- [ ] **Step 1: Import `normalizeTaskPriority` in work-board.tsx**

In `src/app/projects/[id]/work/work-board.tsx`, this import block currently reads:

```tsx
import {
  BOARD_COLUMNS,
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  boardProgress,
  groupSubtasksByParent,
  normalizeTaskStatus,
  subtaskProgress,
  type BoardColumn,
} from "@/lib/work/task-board";
```

Change it to:

```tsx
import {
  BOARD_COLUMNS,
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  boardProgress,
  groupSubtasksByParent,
  normalizeTaskPriority,
  normalizeTaskStatus,
  subtaskProgress,
  type BoardColumn,
} from "@/lib/work/task-board";
```

- [ ] **Step 2: Add the three filter states**

Still in `work-board.tsx`, this block currently reads:

```tsx
  const [error, setError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);
  // View-only preference, not persisted - resets to "manual" on reload/
  // navigation. See KanbanBoard's sortMode prop doc comment for why
  // dragging is disabled while sorted by due date.
  const [sortMode, setSortMode] = useState<"manual" | "due_date">("manual");
```

Add the three new filter states right after it:

```tsx
  const [error, setError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);
  // View-only preference, not persisted - resets to "manual" on reload/
  // navigation. See KanbanBoard's sortMode prop doc comment for why
  // dragging is disabled while sorted by due date.
  const [sortMode, setSortMode] = useState<"manual" | "due_date">("manual");
  // Quick filters, also view-only and not persisted. "all" means the
  // filter isn't restricting anything - AND-combined with the other two.
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
```

- [ ] **Step 3: Derive `availableTags`, `filtersActive`, and `filteredTasks`**

Still in `work-board.tsx`, this line currently reads:

```tsx
  const progress = useMemo(() => boardProgress(topLevelTasks), [topLevelTasks]);

  const handleMove = async (task: Task, status: TaskStatus, sortOrder: number) => {
```

Insert the new derivations between them:

```tsx
  const progress = useMemo(() => boardProgress(topLevelTasks), [topLevelTasks]);

  // Tag options come from the full unfiltered set, so the dropdown's
  // choices stay stable while assignee/priority filters are active rather
  // than shrinking as other filters narrow things down.
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const task of topLevelTasks) {
      for (const tag of task.tags ?? []) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [topLevelTasks]);

  const filtersActive =
    assigneeFilter !== "all" || priorityFilter !== "all" || tagFilter !== "all";

  const filteredTasks = useMemo(() => {
    return topLevelTasks.filter((task) => {
      if (assigneeFilter !== "all" && task.assignee_id !== assigneeFilter) {
        return false;
      }
      if (
        priorityFilter !== "all" &&
        normalizeTaskPriority(task.priority) !== priorityFilter
      ) {
        return false;
      }
      if (tagFilter !== "all" && !(task.tags ?? []).includes(tagFilter)) {
        return false;
      }
      return true;
    });
  }, [topLevelTasks, assigneeFilter, priorityFilter, tagFilter]);

  const handleMove = async (task: Task, status: TaskStatus, sortOrder: number) => {
```

Note: `progress` (the "`X/Y done`" header text) stays computed from `topLevelTasks`, not `filteredTasks` — it's a project-wide stat, not a view-level one. Do not change its input. Likewise, do not change `existingTasks={topLevelTasks}` further down in `CreateTaskDialog`'s props (used to compute a new task's `sort_order` against every existing task in a column, not just the currently-visible ones) — that stays as `topLevelTasks` too.

- [ ] **Step 4: Add the filter row to the header, and pass the new props to `KanbanBoard`**

Still in `work-board.tsx`, this block currently reads:

```tsx
          {canEdit && (
            <Button
              size="sm"
              onClick={() => setCreateFor(columns[0]?.status ?? "todo")}
              style={projectColor ? { backgroundColor: projectColor } : undefined}
            >
              <Plus className="h-4 w-4" />
              New task
            </Button>
          )}
        </header>

        {error && (
```

Insert a new filter row between the header and the error banner:

```tsx
          {canEdit && (
            <Button
              size="sm"
              onClick={() => setCreateFor(columns[0]?.status ?? "todo")}
              style={projectColor ? { backgroundColor: projectColor } : undefined}
            >
              <Plus className="h-4 w-4" />
              New task
            </Button>
          )}
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filter by assignee"
            className="h-8 w-40"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value="all">All assignees</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.email}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by priority"
            className="h-8 w-40"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
          >
            <option value="all">All priorities</option>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by tag"
            className="h-8 w-40"
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
          >
            <option value="all">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </Select>

          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setAssigneeFilter("all");
                setPriorityFilter("all");
                setTagFilter("all");
              }}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
```

This filter row is not wrapped in a `canEdit` check — filtering is a read-only view preference, visible to every viewer, same as the sort-mode `<Select>` above it.

Then this call currently reads:

```tsx
          <KanbanBoard
            tasks={topLevelTasks}
            members={members}
            commentCounts={state.commentCounts}
            subtaskCounts={subtaskCounts}
            columns={columns}
            canEdit={canEdit}
            sortMode={sortMode}
            onOpenTask={setOpenTask}
            onCreateTask={setCreateFor}
            onMoveTask={handleMove}
            projectColor={projectColor}
          />
```

Change `tasks` to the filtered list and add `filtersActive`:

```tsx
          <KanbanBoard
            tasks={filteredTasks}
            members={members}
            commentCounts={state.commentCounts}
            subtaskCounts={subtaskCounts}
            columns={columns}
            canEdit={canEdit}
            sortMode={sortMode}
            filtersActive={filtersActive}
            onOpenTask={setOpenTask}
            onCreateTask={setCreateFor}
            onMoveTask={handleMove}
            projectColor={projectColor}
          />
```

Do not change the `{topLevelTasks.length === 0 ? (...) : (<KanbanBoard ... />)}` ternary's condition — it stays keyed on the unfiltered `topLevelTasks.length`, so the big "No tasks yet" empty-project panel only appears when the project truly has zero tasks, never merely because a filter hides everything (that case is handled per-column inside `KanbanBoard`, via Step 5 below).

- [ ] **Step 5: Add `filtersActive` to `KanbanBoard` and use it for the empty-column message**

In `src/components/work/kanban-board.tsx`, this block currently reads:

```tsx
  /**
   * "due_date" re-sorts every column by nearest deadline and disables
   * drag-and-drop (a dragged position would be overwritten by the sort on
   * the very next render) - changing a task's status while sorted this way
   * still works through the task detail dialog, just not by dragging it to
   * another column.
   */
  sortMode?: "manual" | "due_date";
  onOpenTask: (task: Task) => void;
```

Add the new prop right after `sortMode`:

```tsx
  /**
   * "due_date" re-sorts every column by nearest deadline and disables
   * drag-and-drop (a dragged position would be overwritten by the sort on
   * the very next render) - changing a task's status while sorted this way
   * still works through the task detail dialog, just not by dragging it to
   * another column.
   */
  sortMode?: "manual" | "due_date";
  /**
   * True when at least one board filter (assignee/priority/tag) is
   * currently narrowing `tasks` - lets an empty column say "no tasks match
   * the current filters" instead of its normal empty-state hint, so a
   * filtered-to-zero column doesn't read as "nothing planned here".
   */
  filtersActive?: boolean;
  onOpenTask: (task: Task) => void;
```

Then this block currently reads:

```tsx
export function KanbanBoard({
  tasks,
  members,
  commentCounts = {},
  subtaskCounts = {},
  columns = BOARD_COLUMNS,
  canEdit,
  sortMode = "manual",
  onOpenTask,
  onCreateTask,
  onMoveTask,
  projectColor,
}: KanbanBoardProps) {
```

Add the default-`false` destructure:

```tsx
export function KanbanBoard({
  tasks,
  members,
  commentCounts = {},
  subtaskCounts = {},
  columns = BOARD_COLUMNS,
  canEdit,
  sortMode = "manual",
  filtersActive = false,
  onOpenTask,
  onCreateTask,
  onMoveTask,
  projectColor,
}: KanbanBoardProps) {
```

Finally, this block currently reads:

```tsx
              {columnTasks.length === 0 && !draggingTask && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {column.hint}
                </p>
              )}
```

Change the message to depend on `filtersActive`:

```tsx
              {columnTasks.length === 0 && !draggingTask && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {filtersActive ? "No tasks match the current filters." : column.hint}
                </p>
              )}
```

- [ ] **Step 6: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Lint**

Run:

```bash
npm run lint
```

Expected: no new errors in `src/app/projects/[id]/work/work-board.tsx` or `src/components/work/kanban-board.tsx`. This repo has pre-existing `@typescript-eslint/no-explicit-any` errors in unrelated files — ignore those.

- [ ] **Step 8: Build**

Run:

```bash
npm run build
```

Expected: build succeeds, `/projects/[id]/work` still listed as a route. Note: this worktree may need a `.env.local` present to get past a missing-Supabase-env-vars build failure (a pre-existing environment gap unrelated to this change, hit by the previous round's implementer too) — if so, temporarily copy `.env.local` from `C:\guidon` (gitignored, confirm with `git check-ignore -v .env.local` before copying, and delete it again afterward so nothing gets staged).

- [ ] **Step 9: Run the DB/RLS regression suite**

Run:

```bash
npm run test:db
```

Expected: `132 pass / 0 fail` (this change touches no schema/RLS code at all — this just confirms nothing else regressed).

- [ ] **Step 10: Manual browser check**

There is no running dev server and no browser tool available to you in this subagent context. **Skip this step** — the controlling session performs the manual/browser verification separately after your work is reviewed. Do not attempt to start a dev server.

- [ ] **Step 11: Commit**

```bash
git add "src/app/projects/[id]/work/work-board.tsx" src/components/work/kanban-board.tsx
git commit -m "$(cat <<'EOF'
Add assignee/priority/tag quick filters to the work board

Three independent, AND-combined filters in WorkBoard derive
filteredTasks from the already-loaded topLevelTasks and pass it to
KanbanBoard instead of the unfiltered list - pure client-side view
state, not persisted, no schema or Server Action change. The
project-wide progress header and CreateTaskDialog's sort_order
placement logic both deliberately keep reading from the unfiltered
topLevelTasks, since a filter narrowing what's visible shouldn't
change progress stats or where a new task's sort_order lands among
tasks the filter happens to be hiding. KanbanBoard's new filtersActive
flag swaps an empty column's normal hint for "No tasks match the
current filters" so a filtered-to-zero column doesn't read as
genuinely empty.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is the third of four planned improvements to Guidon's project-planning UX (subtask table — shipped; sort by due date — shipped; board filters — this task; bulk task actions). Confirmed with the user via clarifying question: status is deliberately excluded as a filter dimension (status is already the board's column axis). Design rationale: `docs/superpowers/specs/2026-09-13-board-filters-design.md`.

## Before You Begin

If you have questions about the requirements, approach, dependencies, or anything unclear in the task description above, **ask them now** before starting work.

## Your Job

Once you're clear on requirements:
1. Implement exactly what the task specifies (the 11 steps above, in order — skip Step 10 as instructed)
2. Verify implementation works (tsc, lint, build, test:db as specified)
3. Commit your work (Step 11's exact commit message)
4. Self-review (see below)
5. Report back

**While you work:** If you encounter something unexpected or unclear, ask questions. Don't guess or make assumptions.

## Code Organization

- Follow the file structure and code given in the task exactly — this task's code was fully specified by a prior planning phase, not left for you to design.
- If you find the plan's given code doesn't actually match the current file contents when you go to apply it (e.g. line numbers or surrounding code have drifted), don't force it — read the actual current file, apply the equivalent edit precisely, and note the discrepancy in your report.
- Don't restructure anything outside what the task specifies.

## When You're in Over Your Head

It is always OK to stop and say "this is too hard for me." Bad work is worse than no work.

**STOP and escalate when:**
- The current file contents differ substantially from what the plan assumed, in a way you can't confidently reconcile
- You need to understand code beyond what was provided and can't find clarity
- You feel uncertain about whether your approach is correct

**How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT, describing specifically what you're stuck on.

## Before Reporting Back: Self-Review

Review your work with fresh eyes. Ask yourself:
- Did I fully implement all 11 steps (except skipped Step 10)?
- Are there edge cases I didn't handle?
- Is the code clean, and did I follow the exact code given rather than improvising?
- Did I avoid overbuilding — no persistence, no status filter, no free-text search, no change to `boardProgress`'s inputs?
- Do tsc/lint/build/test:db all actually pass (paste real output, don't assume)?
- Did the project-wide progress header and `CreateTaskDialog`'s `existingTasks` prop both stay on `topLevelTasks`, not `filteredTasks`?

If you find issues during self-review, fix them now before reporting.

## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented (or what you attempted, if blocked)
- What you tested and test results (paste key output)
- Files changed
- Self-review findings (if any)
- Any issues or concerns
- The commit SHA you produced

---

## Plan self-review

**Spec coverage:**
- "Three independent quick filters, AND-combined" — Step 3's `filteredTasks` applies all three conditions in sequence, any failing condition excludes the task. ✓
- "Status deliberately not a filter dimension" — no status filter appears anywhere in the plan. ✓
- "Client-side only, no backend change" — no Server Action, no migration, no API route touched anywhere in this plan. ✓
- "Progress header stays project-wide" — Step 3's comment explicitly calls out leaving `progress`'s input as `topLevelTasks`; Step 4 doesn't touch the progress `<p>` block at all. ✓
- "Column counts reflect what's visible" — automatic once `KanbanBoard` receives `filteredTasks` (its own `columnTasks.length` badge, unchanged code, now counts the filtered set) — no extra code needed, and the plan doesn't add any. ✓
- "Distinguish no tasks from no tasks match filters" — Step 5's `filtersActive` prop and empty-state message swap. ✓
- "Clear filters, visible only when active" — Step 4's `{filtersActive && (<button>...)}`. ✓
- "State: plain view state, not persisted" — Step 2's three plain `useState("all")`, no localStorage/DB anywhere. ✓
- "Interaction with sort mode: filtered list is what gets grouped/sorted" — `KanbanBoard` already receives whatever `tasks` prop it's given and runs `groupTasksByStatus` on it regardless of source; passing `filteredTasks` instead of `topLevelTasks` (Step 4) means sorting now operates on the filtered set automatically, no `KanbanBoard`-internal change needed beyond what Step 5 already adds. ✓
- "UI placement: new row below header, above error banner, not gated by canEdit" — Step 4's insertion point and lack of a `canEdit` wrapper match exactly. ✓
- Verification steps — Steps 6-10 cover tsc/lint/build/test:db/manual (manual correctly deferred). ✓

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step shows complete, copy-pasteable code or an exact command with expected output.

**Type consistency:** `assigneeFilter`/`priorityFilter`/`tagFilter` are all plain `useState("all")` (inferred `string`), consistently compared with `!== "all"` and never given a narrower type — correct, since `assigneeFilter`'s value is either `"all"` or a `member.id` (a `string`), `priorityFilter`'s is either `"all"` or a `TaskPriority` value compared via `normalizeTaskPriority(task.priority) !== priorityFilter` (comparing two strings, no type mismatch since `TASK_PRIORITIES`' values are already plain strings used as `<option value>`), and `tagFilter`'s is either `"all"` or a tag string. `filtersActive` is a plain boolean used identically in both files (`WorkBoard` computes it, `KanbanBoard` receives it as a prop with the same name and boolean type). `KanbanBoardProps.filtersActive?: boolean` (Step 5) matches the `filtersActive={filtersActive}` passed in Step 4.
