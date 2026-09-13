# Board Sort-By-Due-Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a board-wide "Manual / Due date" sort toggle to the work board, so a column can be viewed ordered by nearest deadline instead of only by drag position.

**Architecture:** Pure client-side view state — a new optional comparator parameter on the existing `groupTasksByStatus()` helper, threaded through `KanbanBoard` via a new `sortMode` prop that also disables drag-and-drop while active (a dragged position would be overwritten by the due-date sort on the next render). No schema change, no new Server Action, no persistence.

**Tech Stack:** Next.js Server Actions/React (client components), no new dependencies.

Reference spec: `docs/superpowers/specs/2026-09-13-board-due-date-sort-design.md`

---

### Task 1: Add `compareTasksByDueDate`, wire `sortMode` through the board, add the toggle

**Files:**
- Modify: `src/lib/work/task-board.ts:227-252` (comparator + `groupTasksByStatus` signature)
- Modify: `src/components/work/kanban-board.tsx` (import, props, drag gating)
- Modify: `src/app/projects/[id]/work/work-board.tsx` (state, header control, prop passthrough)

- [ ] **Step 1: Add the due-date comparator and make `groupTasksByStatus` accept a comparator**

In `src/lib/work/task-board.ts`, this block currently reads (lines 227-252):

```ts
export function groupTasksByStatus(tasks: Task[]): TasksByStatus {
  const groups = emptyGroups();

  for (const task of tasks) {
    groups[normalizeTaskStatus(task.status)].push(task);
  }

  for (const status of TASK_STATUSES) {
    groups[status].sort(compareTasks);
  }

  return groups;
}

export function compareTasks(a: Task, b: Task): number {
  const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  const byPriority =
    PRIORITY_RANK[normalizeTaskPriority(a.priority)] -
    PRIORITY_RANK[normalizeTaskPriority(b.priority)];
  if (byPriority !== 0) return byPriority;

  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}
```

Replace it with:

```ts
export function groupTasksByStatus(
  tasks: Task[],
  compare: (a: Task, b: Task) => number = compareTasks
): TasksByStatus {
  const groups = emptyGroups();

  for (const task of tasks) {
    groups[normalizeTaskStatus(task.status)].push(task);
  }

  for (const status of TASK_STATUSES) {
    groups[status].sort(compare);
  }

  return groups;
}

export function compareTasks(a: Task, b: Task): number {
  const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  const byPriority =
    PRIORITY_RANK[normalizeTaskPriority(a.priority)] -
    PRIORITY_RANK[normalizeTaskPriority(b.priority)];
  if (byPriority !== 0) return byPriority;

  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

/**
 * Orders tasks by nearest due date first; a task with no due date always
 * sorts after every dated task. Ties (two undated tasks, or the same date)
 * fall back to compareTasks so their relative order still matches today's
 * manual/priority ordering instead of becoming arbitrary.
 */
export function compareTasksByDueDate(a: Task, b: Task): number {
  const aDue = a.due_date ? new Date(a.due_date).getTime() : null;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : null;

  if (aDue === null && bDue === null) return compareTasks(a, b);
  if (aDue === null) return 1;
  if (bDue === null) return -1;
  if (aDue !== bDue) return aDue - bDue;

  return compareTasks(a, b);
}
```

This is the only call site change needed in this file — `groupTasksByStatus`'s new second parameter has a default, so nothing else that calls it needs to change.

- [ ] **Step 2: Import the new comparator and add `sortMode` to `KanbanBoard`'s props**

In `src/components/work/kanban-board.tsx`, the import block currently reads:

```tsx
import {
  BOARD_COLUMNS,
  groupTasksByStatus,
  normalizeTaskStatus,
  sortOrderForPosition,
  type BoardColumn,
  type SubtaskProgress,
} from "@/lib/work/task-board";
```

Change it to:

```tsx
import {
  BOARD_COLUMNS,
  compareTasksByDueDate,
  groupTasksByStatus,
  normalizeTaskStatus,
  sortOrderForPosition,
  type BoardColumn,
  type SubtaskProgress,
} from "@/lib/work/task-board";
```

Then this block (props interface through the start of the component body):

```tsx
interface KanbanBoardProps {
  tasks: Task[];
  members: TaskCardMember[];
  commentCounts?: Record<string, number>;
  subtaskCounts?: Record<string, SubtaskProgress>;
  /** The project's resolved (default + overrides) column set - see resolveBoardColumns(). */
  columns?: readonly BoardColumn[];
  /** When false the board is read-only (viewer/tester roles). */
  canEdit: boolean;
  onOpenTask: (task: Task) => void;
  onCreateTask: (status: TaskStatus) => void;
  /**
   * Persist a move. `sortOrder` positions the task within the target column.
   * The parent is responsible for optimistic state and rollback.
   */
  onMoveTask: (
    task: Task,
    status: TaskStatus,
    sortOrder: number
  ) => Promise<void> | void;
  projectColor?: string;
}

interface DropTarget {
  status: TaskStatus;
  index: number;
}

export function KanbanBoard({
  tasks,
  members,
  commentCounts = {},
  subtaskCounts = {},
  columns = BOARD_COLUMNS,
  canEdit,
  onOpenTask,
  onCreateTask,
  onMoveTask,
  projectColor,
}: KanbanBoardProps) {
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const groups = groupTasksByStatus(tasks);
  const membersById = new Map(members.map((member) => [member.id, member]));
```

becomes:

```tsx
interface KanbanBoardProps {
  tasks: Task[];
  members: TaskCardMember[];
  commentCounts?: Record<string, number>;
  subtaskCounts?: Record<string, SubtaskProgress>;
  /** The project's resolved (default + overrides) column set - see resolveBoardColumns(). */
  columns?: readonly BoardColumn[];
  /** When false the board is read-only (viewer/tester roles). */
  canEdit: boolean;
  /**
   * "due_date" re-sorts every column by nearest deadline and disables
   * drag-and-drop (a dragged position would be overwritten by the sort on
   * the very next render) - changing a task's status while sorted this way
   * still works through the task detail dialog, just not by dragging it to
   * another column.
   */
  sortMode?: "manual" | "due_date";
  onOpenTask: (task: Task) => void;
  onCreateTask: (status: TaskStatus) => void;
  /**
   * Persist a move. `sortOrder` positions the task within the target column.
   * The parent is responsible for optimistic state and rollback.
   */
  onMoveTask: (
    task: Task,
    status: TaskStatus,
    sortOrder: number
  ) => Promise<void> | void;
  projectColor?: string;
}

interface DropTarget {
  status: TaskStatus;
  index: number;
}

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
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Dragging is disabled while sorted by due date - see sortMode's doc
  // comment above.
  const canDrag = canEdit && sortMode === "manual";

  const groups = groupTasksByStatus(
    tasks,
    sortMode === "due_date" ? compareTasksByDueDate : undefined
  );
  const membersById = new Map(members.map((member) => [member.id, member]));
```

- [ ] **Step 3: Gate every drag-related check on `canDrag` instead of `canEdit`**

Still in `src/components/work/kanban-board.tsx`, four more spots reference `canEdit` for drag behavior. The "+ add task" button in the column header (which stays `canEdit`-gated, unaffected) is not one of them — only these four:

`handleReorder` currently:

```tsx
  const handleReorder = async (task: Task, direction: "up" | "down") => {
    if (!canEdit) return;
    const status = normalizeTaskStatus(task.status);
```

becomes:

```tsx
  const handleReorder = async (task: Task, direction: "up" | "down") => {
    if (!canDrag) return;
    const status = normalizeTaskStatus(task.status);
```

`handleDrop` currently:

```tsx
  const handleDrop = async (status: TaskStatus, index: number) => {
    const task = draggingTask;
    resetDrag();

    if (!task || !canEdit) return;
```

becomes:

```tsx
  const handleDrop = async (status: TaskStatus, index: number) => {
    const task = draggingTask;
    resetDrag();

    if (!task || !canDrag) return;
```

The column's `onDragOver`/`onDrop` currently:

```tsx
            onDragOver={(event) => {
              if (!draggingTask || !canEdit) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              // Dropping on column padding appends to the end.
              if (!isTargetColumn) {
                setDropTarget({
                  status: column.status,
                  index: columnTasks.length,
                });
              }
            }}
            onDrop={(event) => {
              if (!draggingTask || !canEdit) return;
              event.preventDefault();
              void handleDrop(
                column.status,
                dropTarget?.status === column.status
                  ? dropTarget.index
                  : columnTasks.length
              );
            }}
```

becomes:

```tsx
            onDragOver={(event) => {
              if (!draggingTask || !canDrag) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              // Dropping on column padding appends to the end.
              if (!isTargetColumn) {
                setDropTarget({
                  status: column.status,
                  index: columnTasks.length,
                });
              }
            }}
            onDrop={(event) => {
              if (!draggingTask || !canDrag) return;
              event.preventDefault();
              void handleDrop(
                column.status,
                dropTarget?.status === column.status
                  ? dropTarget.index
                  : columnTasks.length
              );
            }}
```

And the per-task `DropZone`/`TaskCard` block currently:

```tsx
              {columnTasks.map((task, index) => (
                <div key={task.id}>
                  <DropZone
                    active={
                      isTargetColumn &&
                      dropTarget?.index === index &&
                      draggingTask?.id !== task.id
                    }
                    enabled={Boolean(draggingTask) && canEdit}
                    onEnter={() =>
                      setDropTarget({ status: column.status, index })
                    }
                    onDrop={() => void handleDrop(column.status, index)}
                    projectColor={projectColor}
                  />
                  <TaskCard
                    task={task}
                    assignee={
                      task.assignee_id
                        ? membersById.get(task.assignee_id)
                        : undefined
                    }
                    commentCount={commentCounts[task.id]}
                    subtaskProgress={subtaskCounts[task.id]}
                    draggable={canEdit}
                    isDragging={draggingTask?.id === task.id}
                    onOpen={onOpenTask}
                    onDragStart={setDraggingTask}
                    onDragEnd={resetDrag}
                    onReorder={canEdit ? handleReorder : undefined}
                    canMoveUp={index > 0}
                    canMoveDown={index < columnTasks.length - 1}
                    projectColor={projectColor}
                  />
                </div>
              ))}

              <DropZone
                active={
                  isTargetColumn && dropTarget?.index === columnTasks.length
                }
                enabled={Boolean(draggingTask) && canEdit}
                onEnter={() =>
                  setDropTarget({
                    status: column.status,
                    index: columnTasks.length,
                  })
                }
                onDrop={() => void handleDrop(column.status, columnTasks.length)}
                grow
                projectColor={projectColor}
              />
```

becomes:

```tsx
              {columnTasks.map((task, index) => (
                <div key={task.id}>
                  <DropZone
                    active={
                      isTargetColumn &&
                      dropTarget?.index === index &&
                      draggingTask?.id !== task.id
                    }
                    enabled={Boolean(draggingTask) && canDrag}
                    onEnter={() =>
                      setDropTarget({ status: column.status, index })
                    }
                    onDrop={() => void handleDrop(column.status, index)}
                    projectColor={projectColor}
                  />
                  <TaskCard
                    task={task}
                    assignee={
                      task.assignee_id
                        ? membersById.get(task.assignee_id)
                        : undefined
                    }
                    commentCount={commentCounts[task.id]}
                    subtaskProgress={subtaskCounts[task.id]}
                    draggable={canDrag}
                    isDragging={draggingTask?.id === task.id}
                    onOpen={onOpenTask}
                    onDragStart={setDraggingTask}
                    onDragEnd={resetDrag}
                    onReorder={canDrag ? handleReorder : undefined}
                    canMoveUp={index > 0}
                    canMoveDown={index < columnTasks.length - 1}
                    projectColor={projectColor}
                  />
                </div>
              ))}

              <DropZone
                active={
                  isTargetColumn && dropTarget?.index === columnTasks.length
                }
                enabled={Boolean(draggingTask) && canDrag}
                onEnter={() =>
                  setDropTarget({
                    status: column.status,
                    index: columnTasks.length,
                  })
                }
                onDrop={() => void handleDrop(column.status, columnTasks.length)}
                grow
                projectColor={projectColor}
              />
```

Do not touch the `{canEdit && (<Button ... onClick={() => onCreateTask(column.status)}>...)}` block in the column header — creating a task in a specific column stays available regardless of sort mode.

- [ ] **Step 4: Add the sort-mode state and toggle to `WorkBoard`**

In `src/app/projects/[id]/work/work-board.tsx`, this block currently reads (around line 81-83):

```tsx
  const [error, setError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);
```

Add the new state right after it:

```tsx
  const [error, setError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);
  // View-only preference, not persisted - resets to "manual" on reload/
  // navigation. See KanbanBoard's sortMode prop doc comment for why
  // dragging is disabled while sorted by due date.
  const [sortMode, setSortMode] = useState<"manual" | "due_date">("manual");
```

`Select` is already imported at the top of this file (used by `CreateTaskDialog`), so no new import is needed.

Then the header JSX currently reads:

```tsx
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Work</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {projectName}
              {progress.total > 0 && (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {progress.done}/{progress.total} done ({progress.percent}%)
                  </span>
                  {progress.inFlight > 0 && (
                    <>
                      {" · "}
                      <span className="tabular-nums">{progress.inFlight} in progress</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          {canEdit && aiAvailable && (
```

Insert the sort-mode `<Select>` between the title/progress `<div>` and the AI-chat block:

```tsx
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Work</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {projectName}
              {progress.total > 0 && (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {progress.done}/{progress.total} done ({progress.percent}%)
                  </span>
                  {progress.inFlight > 0 && (
                    <>
                      {" · "}
                      <span className="tabular-nums">{progress.inFlight} in progress</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          <Select
            aria-label="Sort board by"
            className="h-8 w-40"
            value={sortMode}
            onChange={(event) =>
              setSortMode(event.target.value as "manual" | "due_date")
            }
          >
            <option value="manual">Manual order</option>
            <option value="due_date">Due date</option>
          </Select>

          {canEdit && aiAvailable && (
```

Finally, this call currently reads:

```tsx
          <KanbanBoard
            tasks={topLevelTasks}
            members={members}
            commentCounts={state.commentCounts}
            subtaskCounts={subtaskCounts}
            columns={columns}
            canEdit={canEdit}
            onOpenTask={setOpenTask}
            onCreateTask={setCreateFor}
            onMoveTask={handleMove}
            projectColor={projectColor}
          />
```

Add `sortMode`:

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

- [ ] **Step 5: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Lint**

Run:

```bash
npm run lint
```

Expected: no new errors in `src/lib/work/task-board.ts`, `src/components/work/kanban-board.tsx`, or `src/app/projects/[id]/work/work-board.tsx`. This repo has pre-existing `@typescript-eslint/no-explicit-any` errors in unrelated files — ignore those.

- [ ] **Step 7: Build**

Run:

```bash
npm run build
```

Expected: build succeeds, `/projects/[id]/work` still listed as a route.

- [ ] **Step 8: Run the DB/RLS regression suite**

Run:

```bash
npm run test:db
```

Expected: `132 pass / 0 fail` (this change touches no schema/RLS code at all — this just confirms nothing else regressed).

- [ ] **Step 9: Manual browser check**

There is no running dev server and no browser tool available to you in this subagent context. **Skip this step** — the controlling session performs the manual/browser verification separately after your work is reviewed. Do not attempt to start a dev server.

- [ ] **Step 10: Commit**

```bash
git add src/lib/work/task-board.ts src/components/work/kanban-board.tsx "src/app/projects/[id]/work/work-board.tsx"
git commit -m "$(cat <<'EOF'
Add a Manual/Due date sort toggle to the work board

groupTasksByStatus() gains an optional comparator (defaulting to the
existing compareTasks), and a new compareTasksByDueDate orders by
nearest deadline with undated tasks always last. KanbanBoard's new
sortMode prop picks the comparator and, when set to "due_date", also
disables drag-and-drop - a dragged position would be silently
overwritten by the due-date sort on the very next render, so it's
made an explicit constraint instead. Changing a task's status while
sorted by due date still works through the task detail dialog, just
not by dragging it to another column. Pure client-side view state,
not persisted - no schema change, no new Server Action.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Context

This is the second of four planned improvements to Guidon's project-planning UX (subtask table — shipped; deadline visibility — this plan; board filters; bulk actions). The per-card due-date indicator (colored text + icon, `dueState()`/`DUE_STATE_CLASSES`/`formatDueDate` in `src/lib/work/task-board.ts`, rendered by `TaskCard`) already exists and is out of scope — confirmed with the user the only gap is the lack of a way to order a column by nearest deadline. Design rationale: `docs/superpowers/specs/2026-09-13-board-due-date-sort-design.md`.

## Before You Begin

If you have questions about the requirements, approach, dependencies, or anything unclear in the task description above, **ask them now** before starting work.

## Your Job

Once you're clear on requirements:
1. Implement exactly what the task specifies (the 10 steps above, in order — skip Step 9 as instructed)
2. Verify implementation works (tsc, lint, build, test:db as specified)
3. Commit your work (Step 10's exact commit message)
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
- Did I fully implement all 10 steps (except skipped Step 9)?
- Are there edge cases I didn't handle?
- Is the code clean, and did I follow the exact code given rather than improvising?
- Did I avoid overbuilding — no extra features beyond what the task specifies (no persistence, no per-column toggle, no due-soon badge)?
- Do tsc/lint/build/test:db all actually pass (paste real output, don't assume)?
- Did I leave the "+ add task" button's `canEdit` gate untouched (it should NOT have become `canDrag`)?

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
- "One board-wide toggle, not per-column" — Step 4 adds one `sortMode` state in `WorkBoard`, passed down. ✓
- "Visible to every viewer... not gated by canEdit" — the `<Select>` in Step 4 sits outside any `canEdit` conditional. ✓
- "State lives in a plain useState... not persisted" — Step 4's `useState<"manual" | "due_date">("manual")`, no localStorage/DB touch anywhere in the plan. ✓
- "A second comparator, not a parallel data path" — Step 1 adds one optional parameter to the existing `groupTasksByStatus`, no new grouping function. ✓
- "Dated tasks ascending, undated always last, ties fall back to compareTasks" — `compareTasksByDueDate` in Step 1 matches exactly. ✓
- "Dragging is disabled while sorted by due date... status change still works via the dialog" — Step 3's four `canEdit`→`canDrag` substitutions cover both mouse drag (`onDragOver`/`onDrop`/`TaskCard draggable`) and keyboard reorder (`handleReorder`/`onReorder`); the task detail dialog's status field is untouched by this plan, so it keeps working exactly as it does today. ✓
- "UI: a `<Select>`... between progress text and New task button" — Step 4's JSX placement matches. ✓
- Verification steps (tsc/lint/build/test:db/manual) — Steps 5-9 cover all of them, with Step 9 correctly deferred to the controlling session (no browser access here, same pattern as the prior plan). ✓

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step shows complete, copy-pasteable code or an exact command with expected output.

**Type consistency:** `sortMode?: "manual" | "due_date"` (KanbanBoardProps) matches `useState<"manual" | "due_date">("manual")` (WorkBoard) matches the `<Select>`'s `onChange` cast (`event.target.value as "manual" | "due_date"`) matches `compareTasksByDueDate`'s signature (`(a: Task, b: Task) => number`, identical to `compareTasks`'s, so it satisfies `groupTasksByStatus`'s new `compare` parameter type without a cast). `canDrag` is computed once in `KanbanBoard` and used consistently everywhere `canEdit` previously gated drag behavior — confirmed by re-reading Step 3 line by line against Step 2's full destructuring, no leftover bare `canEdit` in a drag-related spot.
