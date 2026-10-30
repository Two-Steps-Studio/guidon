/**
 * Guidon work module - board vocabulary and helpers.
 *
 * Single source of truth for how tasks are grouped, ordered, labelled and
 * coloured. Pages should import from here rather than redeclaring column
 * definitions, so the board, the task dialog and the overview widgets can
 * never drift apart.
 */

import { formatCalendarDate, utcDaysBetween } from "@/lib/date";
import type {
  BuiltinTaskPriority,
  BuiltinTaskStatus,
  LegacyTaskStatus,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/task";

/** Status and priority keys (migration 060's CHECK). */
export const WORKFLOW_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

// ============================================
// STATUS
// ============================================

export interface BoardColumn {
  status: TaskStatus;
  label: string;
  /** Short helper shown when the column is empty. */
  hint: string;
  /** Tailwind class for the column's accent dot (built-in columns). */
  accentClass: string;
  /** Hex colour of a custom column's dot; wins over accentClass when set. */
  color?: string | null;
  /** Tasks here count as finished (dashboard, progress, My tasks, API). */
  isDone: boolean;
  /** A column the project added (migration 060), not one of the built-in six. */
  custom: boolean;
}

/**
 * Column order defines the workflow left-to-right. Statuses are intended to
 * become project-configurable; until then this constant is the default set.
 */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    status: "backlog",
    isDone: false,
    custom: false,
    label: "Backlog",
    hint: "Unscheduled work",
    accentClass: "bg-muted-foreground",
  },
  {
    status: "todo",
    isDone: false,
    custom: false,
    label: "Todo",
    hint: "Ready to pick up",
    accentClass: "bg-info",
  },
  {
    status: "in_progress",
    isDone: false,
    custom: false,
    label: "In Progress",
    hint: "Being worked on",
    accentClass: "bg-warning",
  },
  {
    status: "ai_working",
    isDone: false,
    custom: false,
    label: "AI Working",
    hint: "An AI agent is working on this",
    accentClass: "bg-info",
  },
  {
    status: "review",
    isDone: false,
    custom: false,
    label: "Review",
    hint: "Awaiting review",
    accentClass: "bg-primary",
  },
  {
    status: "done",
    isDone: true,
    custom: false,
    label: "Done",
    hint: "Shipped",
    accentClass: "bg-success",
  },
] as const;

/** The built-in six - what the API's start/complete and new tasks rely on. */
export const TASK_STATUSES: readonly BuiltinTaskStatus[] = BOARD_COLUMNS.map(
  (column) => column.status as BuiltinTaskStatus
);

export function isBuiltinStatus(status: string): status is BuiltinTaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(status);
}

export interface BoardColumnOverride {
  status: TaskStatus;
  label: string | null;
  sort_order: number;
  hidden: boolean;
  /** Custom columns only (migration 060); the built-in "done" is always done. */
  is_done?: boolean;
  color?: string | null;
}

/**
 * Applies a project's saved column customizations (020_project_board_columns.sql)
 * on top of the fixed defaults - label and order can change, but the
 * underlying status set cannot (tasks.status is still the same 6-value
 * CHECK constraint from 016; this only changes how those 6 are displayed).
 * A project with no saved overrides gets BOARD_COLUMNS back unchanged.
 *
 * Hidden columns are dropped entirely rather than kept-but-marked, since
 * the save path (project_board_columns actions) refuses to hide a column
 * that still has tasks in it - by the time a column can be hidden here,
 * nothing on the board needs to reference it.
 */
/**
 * `translate`, when passed, supplies the localized default label/hint for a
 * status (e.g. `(status) => ({ label: t("status", { status }), hint: t("statusHint", { status }) })`)
 * - a project's saved override `label` is free text a person typed into
 * board-columns-form.tsx, so it's never translated, only the untouched
 * default is. Callers with no translator (e.g. the settings-form validation
 * path) get the English BOARD_COLUMNS default back, unchanged.
 */
export function resolveBoardColumns(
  overrides: readonly BoardColumnOverride[],
  translate?: (status: TaskStatus) => { label: string; hint: string }
): BoardColumn[] {
  return resolveAllBoardColumns(overrides, translate)
    .filter((entry) => !entry.hidden)
    .map((entry) => entry.column);
}

/**
 * Every column - built-in and the project's own (migration 060), hidden
 * ones included - in board order. The settings form edits this list;
 * everything else wants resolveBoardColumns' visible subset.
 */
export function resolveAllBoardColumns(
  overrides: readonly BoardColumnOverride[],
  translate?: (status: TaskStatus) => { label: string; hint: string }
): { column: BoardColumn; sortOrder: number; hidden: boolean }[] {
  const overrideByStatus = new Map(overrides.map((o) => [o.status, o]));

  const builtin = BOARD_COLUMNS.map((column, index) => {
    const override = overrideByStatus.get(column.status);
    const defaults = translate ? translate(column.status) : column;
    return {
      column: { ...column, label: override?.label ?? defaults.label, hint: defaults.hint, color: override?.color ?? null },
      sortOrder: override?.sort_order ?? index,
      hidden: override?.hidden ?? false,
    };
  });
  const custom = overrides
    .filter((override) => !isBuiltinStatus(override.status))
    .map((override) => ({
      column: {
        status: override.status,
        label: override.label || override.status,
        hint: "",
        accentClass: "bg-muted-foreground",
        color: override.color ?? null,
        isDone: !!override.is_done,
        custom: true,
      } satisfies BoardColumn,
      sortOrder: override.sort_order,
      hidden: override.hidden,
    }));

  return [...builtin, ...custom].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Rows written before migration 002 still carry the old vocabulary. Fold them
 * onto the current statuses so the board renders correctly either way.
 */
const LEGACY_STATUS_MAP: Record<LegacyTaskStatus, TaskStatus> = {
  testing: "review",
  completed: "done",
};

/**
 * A status as stored: a built-in or a custom column key passes through
 * (the database guarantees custom keys exist in the project, migration
 * 060); legacy values are folded; anything empty or malformed is Backlog.
 */
export function normalizeTaskStatus(
  status: TaskStatus | LegacyTaskStatus | string | null | undefined
): TaskStatus {
  if (!status) return "backlog";
  const mapped = LEGACY_STATUS_MAP[status as LegacyTaskStatus];
  if (mapped) return mapped;
  return WORKFLOW_KEY_RE.test(status) ? status : "backlog";
}

export function statusLabel(
  status: TaskStatus | LegacyTaskStatus | string,
  columns?: readonly BoardColumn[]
): string {
  const normalized = normalizeTaskStatus(status);
  return (
    (columns ?? BOARD_COLUMNS).find((column) => column.status === normalized)?.label ??
    BOARD_COLUMNS.find((column) => column.status === normalized)?.label ??
    normalized
  );
}

/**
 * Whether a status means "finished": the built-in done, or a custom column
 * marked as done in `columns`. Prefer isTaskDone when the task row (with
 * its database-kept is_done) is at hand.
 */
export function isDone(
  status: TaskStatus | LegacyTaskStatus | string,
  columns?: readonly BoardColumn[]
): boolean {
  const normalized = normalizeTaskStatus(status);
  if (normalized === "done") return true;
  return !!columns?.find((column) => column.status === normalized)?.isDone;
}

export function isTaskDone(task: Pick<Task, "status" | "is_done">, columns?: readonly BoardColumn[]): boolean {
  return task.is_done ?? isDone(task.status, columns);
}

// ============================================
// PRIORITY
// ============================================

export const TASK_PRIORITIES: readonly BuiltinTaskPriority[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export function isBuiltinPriority(priority: string): priority is BuiltinTaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(priority);
}

export const PRIORITY_LABELS: Record<BuiltinTaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * Restrained treatment: a coloured rule plus muted text, rather than a
 * saturated pill on every card. Keeps a dense board readable.
 */
export const PRIORITY_CLASSES: Record<BuiltinTaskPriority, string> = {
  low: "text-priority-low border-priority-low/30",
  medium: "text-priority-medium border-priority-medium/40",
  high: "text-priority-high border-priority-high/50",
  critical: "text-priority-critical border-priority-critical/60",
};

export const PRIORITY_DOT_CLASSES: Record<BuiltinTaskPriority, string> = {
  low: "bg-priority-low",
  medium: "bg-priority-medium",
  high: "bg-priority-high",
  critical: "bg-priority-critical",
};

/** A built-in or custom priority key passes through; anything else is Medium. */
export function normalizeTaskPriority(
  priority: string | null | undefined
): TaskPriority {
  return priority && WORKFLOW_KEY_RE.test(priority) ? priority : "medium";
}

const PRIORITY_RANK: Record<BuiltinTaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** A project's priority (migration 060): built-in, possibly relabelled, or its own. */
export interface PriorityDef {
  key: TaskPriority;
  label: string;
  /** Hex colour; null = the built-in token colour (PRIORITY_DOT_CLASSES). */
  color: string | null;
  /** Lower = more important; orders cards and the pickers. */
  rank: number;
  custom: boolean;
}

export interface PriorityOverride {
  key: TaskPriority;
  label: string | null;
  color: string | null;
  rank: number;
  hidden: boolean;
}

/**
 * Every priority of a project in importance order (built-ins with their
 * overrides, then custom ones by rank). Hidden ones are left out unless
 * `includeHidden` - a task can still carry one, shown via priorityDef's
 * fallback.
 */
export function resolvePriorities(
  overrides: readonly PriorityOverride[],
  translate?: (priority: BuiltinTaskPriority) => string,
  includeHidden = false
): (PriorityDef & { hidden: boolean })[] {
  const byKey = new Map(overrides.map((o) => [o.key, o]));
  const builtin = TASK_PRIORITIES.map((key) => {
    const override = byKey.get(key);
    return {
      key,
      label: override?.label || (translate ? translate(key) : PRIORITY_LABELS[key]),
      color: override?.color ?? null,
      rank: override?.rank ?? PRIORITY_RANK[key],
      custom: false,
      hidden: override?.hidden ?? false,
    };
  });
  const custom = overrides
    .filter((o) => !isBuiltinPriority(o.key))
    .map((o) => ({ key: o.key, label: o.label || o.key, color: o.color, rank: o.rank, custom: true, hidden: o.hidden }));
  return [...builtin, ...custom]
    .filter((p) => includeHidden || !p.hidden)
    .sort((a, b) => a.rank - b.rank);
}

/** Display data for a task's priority, also when it isn't in `defs` (hidden, or no project context). */
export function priorityDef(priority: string | null | undefined, defs?: readonly PriorityDef[]): PriorityDef {
  const key = normalizeTaskPriority(priority);
  const found = defs?.find((d) => d.key === key);
  if (found) return found;
  if (isBuiltinPriority(key)) return { key, label: PRIORITY_LABELS[key], color: null, rank: PRIORITY_RANK[key], custom: false };
  return { key, label: key, color: null, rank: 1.5, custom: true };
}

/** Class + inline style for a priority dot: token class for built-ins, the hex colour otherwise. */
export function priorityDot(priority: string | null | undefined, defs?: readonly PriorityDef[]): {
  className: string;
  style?: { backgroundColor: string };
} {
  const def = priorityDef(priority, defs);
  if (def.color) return { className: "", style: { backgroundColor: def.color } };
  return { className: isBuiltinPriority(def.key) ? PRIORITY_DOT_CLASSES[def.key] : "bg-muted-foreground" };
}

function priorityRank(priority: string | null | undefined, defs?: readonly PriorityDef[]): number {
  return priorityDef(priority, defs).rank;
}

// ============================================
// GROUPING / ORDERING
// ============================================

/** Tasks per column key; every built-in key is present, custom ones when they have tasks or columns. */
export type TasksByStatus = Record<string, Task[]>;

function emptyGroups(columns?: readonly BoardColumn[]): TasksByStatus {
  const groups: TasksByStatus = {};
  for (const status of TASK_STATUSES) groups[status] = [];
  for (const column of columns ?? []) groups[column.status] = [];
  return groups;
}

/**
 * Group tasks into board columns, ordered by sort_order then priority then
 * creation time. Tasks with an unknown status land in Backlog rather than
 * disappearing from the board.
 */
export function groupTasksByStatus(
  tasks: Task[],
  compare: (a: Task, b: Task) => number = compareTasks,
  columns?: readonly BoardColumn[]
): TasksByStatus {
  const groups = emptyGroups(columns);

  for (const task of tasks) {
    (groups[normalizeTaskStatus(task.status)] ??= []).push(task);
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort(compare);
  }

  return groups;
}

/** compareTasks with a project's priority order (custom priorities, re-ranked built-ins). */
export function taskComparator(priorities?: readonly PriorityDef[]): (a: Task, b: Task) => number {
  return (a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const byPriority = priorityRank(a.priority, priorities) - priorityRank(b.priority, priorities);
    if (byPriority !== 0) return byPriority;

    return timestampValue(a.created_at) - timestampValue(b.created_at);
  };
}

export const compareTasks = taskComparator();

/** Personal pins lead each column without changing the project's saved order. */
export function pinnedTaskComparator(
  pinnedIds: ReadonlySet<string>,
  compare: (a: Task, b: Task) => number
): (a: Task, b: Task) => number {
  return (a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)) || compare(a, b);
}

/** Pins form a separate ordered group: midpoint arithmetic must not span it. */
export type RelativeTaskPosition = { id: string; side: "before" | "after" };

export function taskPositionAnchor(column: Task[], index: number, movingId?: string): RelativeTaskPosition | undefined {
  const siblings = column.filter(task => task.id !== movingId);
  const next = siblings[index];
  if (next) return { id: next.id, side: "before" };
  const previous = siblings[index - 1];
  return previous ? { id: previous.id, side: "after" } : undefined;
}

export function pinnedTaskDrop(column: Task[], index: number, movingId: string, pinnedIds: ReadonlySet<string>) {
  const siblings = column.filter(task => task.id !== movingId);
  const movingPinned = pinnedIds.has(movingId);
  const pinCount = siblings.filter(task => pinnedIds.has(task.id)).length;
  const bounded = Math.max(0, Math.min(index, siblings.length));
  const targetIndex = movingPinned ? Math.min(bounded, pinCount) : Math.max(bounded, pinCount);
  const peers = siblings.filter(task => pinnedIds.has(task.id) === movingPinned);
  const peerIndex = movingPinned ? targetIndex : targetIndex - pinCount;
  return { index: targetIndex, sortOrder: sortOrderForPosition(peers, peerIndex), anchor: taskPositionAnchor(peers, peerIndex) };
}

/**
 * Same underlying issue as dueDateKey above, for any other timestamptz
 * column (created_at here) used only for ordering: self-hosted mode hands
 * back a `Date` instance despite the `string` type, and `.localeCompare`
 * doesn't exist on `Date` - this crashed the whole board (React error #441,
 * an uncaught render error) as soon as two tasks tied on sort_order and
 * priority, self-hosted only. Comparing numeric timestamps also sidesteps
 * relying on ISO-string lexicographic ordering, which `.localeCompare`
 * happened to get right but wasn't actually guaranteed to.
 */
function timestampValue(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
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

// ============================================
// PROGRESS
// ============================================

export interface BoardProgress {
  total: number;
  done: number;
  inFlight: number;
  percent: number;
}

export function boardProgress(tasks: Task[], columns?: readonly BoardColumn[]): BoardProgress {
  const total = tasks.length;
  const done = tasks.filter((task) => isTaskDone(task, columns)).length;
  const inFlight = tasks.filter(
    (task) => normalizeTaskStatus(task.status) === "in_progress"
  ).length;

  return {
    total,
    done,
    inFlight,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

// ============================================
// SUBTASKS
// ============================================

/**
 * Groups tasks by parent_task_id (migration 010). Top-level tasks (no
 * parent) are not represented in the result - only entries that have at
 * least one subtask appear.
 */
export function groupSubtasksByParent(tasks: Task[]): Record<string, Task[]> {
  const groups: Record<string, Task[]> = {};

  for (const task of tasks) {
    if (!task.parent_task_id) continue;
    (groups[task.parent_task_id] ??= []).push(task);
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort(compareTasks);
  }

  return groups;
}

export interface SubtaskProgress {
  done: number;
  total: number;
  /** The first few subtasks in board order, for the card's checklist under the description. */
  items?: { id: string; title: string; done: boolean }[];
}

/** How long a task counts as new on the board ("New" badge on its card). */
export const NEW_TASK_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Created in the last day and not finished yet - a finished task isn't news. */
export function isNewTask(task: Pick<Task, "created_at" | "status" | "is_done">, now: number = Date.now()): boolean {
  if (task.is_done || task.status === "done" || !task.created_at) return false;
  const age = now - new Date(task.created_at).getTime();
  return age >= 0 && age < NEW_TASK_WINDOW_MS;
}

/** How many subtasks a board card lists by name; the rest are "+N". */
export const CARD_SUBTASK_PREVIEW = 3;

export function subtaskProgress(subtasks: Task[], columns?: readonly BoardColumn[]): SubtaskProgress {
  return {
    done: subtasks.filter((task) => isTaskDone(task, columns)).length,
    total: subtasks.length,
    items: subtasks
      .slice(0, CARD_SUBTASK_PREVIEW)
      .map((task) => ({ id: task.id, title: task.title, done: isTaskDone(task, columns) })),
  };
}

// ============================================
// DUE DATES
// ============================================

export type DueState = "none" | "upcoming" | "soon" | "overdue";

/**
 * `Task.due_date` is typed `string`, and that's exactly what it is when it
 * arrives from Supabase/PostgREST (a JSON API) - but `tasks.due_date` is
 * `timestamptz`, and a direct `pg` query (self-hosted mode) hands back a
 * native `Date` object for that column, which the compiler's `string`
 * annotation doesn't stop at runtime. Every call site that needs just the
 * calendar day (an HTML date input's value, a calendar's day key) goes
 * through this instead of assuming `.slice()` works on whatever shape
 * actually showed up - it silently crashed both the task dialog and the
 * calendar page in self-hosted mode before this existed.
 */
export function dueDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.slice(0, 10);
}

export function dueState(
  dueDate: string | null,
  status: TaskStatus | LegacyTaskStatus | string,
  /** The task's is_done (custom done columns); falls back to the status. */
  done?: boolean
): DueState {
  if (!dueDate || (done ?? isDone(status))) return "none";

  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return "none";

  // Calendar-day comparison, not an instant delta - due_date is written as
  // UTC midnight of the picked day (see lib/date.ts), so comparing exact
  // instants against Date.now() flips "overdue" up to a full day early for
  // any viewer west of UTC, and up to a day late for anyone east of it.
  const daysUntilDue = utcDaysBetween(Date.now(), due);

  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= 1) return "soon"; // due today or tomorrow
  return "upcoming";
}

export const DUE_STATE_CLASSES: Record<DueState, string> = {
  none: "text-muted-foreground",
  upcoming: "text-muted-foreground",
  soon: "text-warning",
  overdue: "text-danger",
};

export const formatDueDate = formatCalendarDate;

// ============================================
// SORT ORDER
// ============================================

/**
 * Compute a sort_order that places a task at `index` within `column`.
 * Uses midpoint insertion so a drop only rewrites the moved row.
 */
export function sortOrderForPosition(
  column: Task[],
  index: number,
  movingTaskId?: string
): number {
  const siblings = column.filter((task) => task.id !== movingTaskId);

  const before = siblings[index - 1]?.sort_order ?? null;
  const after = siblings[index]?.sort_order ?? null;

  if (before === null && after === null) return 1000;
  if (before === null) return (after as number) - 100;
  if (after === null) return before + 100;

  const midpoint = (before + after) / 2;

  // Ran out of room between neighbours - caller should renumber the column.
  return Number.isFinite(midpoint) ? midpoint : before + 100;
}

const RENUMBER_SPACING = 1000;

/**
 * `sort_order` is `integer` (000_baseline_schema.sql), but sortOrderForPosition()
 * above computes a float midpoint - fine as long as there's still room between
 * two neighbouring integers, but once a column has been tightly reordered
 * enough that two adjacent tasks are 1 apart (or the drop target's own
 * midpoint rounds onto an existing value), rounding at persist time collides
 * with whichever task was already sitting there. Every future insertion
 * between them rounds to that same value, so the dropped card silently
 * lands wherever compareTasks()'s tiebreak (priority, then created_at)
 * decides instead of where it was actually dropped - the bug this function
 * exists to close, per its own long-standing "caller should renumber the
 * column" comment above.
 *
 * `siblings` is every OTHER task currently in the destination column
 * (already sorted by sort_order, ascending), and `rawSortOrder` the float
 * sortOrderForPosition() computed for the task being moved. Returns null
 * when `Math.round(rawSortOrder)` doesn't collide with any sibling - the
 * cheap, common-case single-row write callers should still do themselves.
 * Otherwise returns a full renumbering plan (every sibling plus the moved
 * task, each spaced RENUMBER_SPACING apart in their new relative order) for
 * the caller to persist as one batch.
 */
export function resolveColumnRenumbering(
  siblings: { id: string; sort_order: number | null }[],
  movingTaskId: string,
  rawSortOrder: number,
  anchor?: RelativeTaskPosition
): { id: string; sort_order: number }[] | null {
  const rounded = Math.round(rawSortOrder);
  const collides = siblings.some((task) => task.sort_order === rounded);
  if (!collides && !(anchor && siblings.some(task => task.sort_order === null))) return null;

  // Where the moving task ranks among the current siblings - not by the
  // rounded integer (that's exactly the value in collision), but by the
  // original float, which is only ever equal to an existing sort_order at
  // the boundaries (sortOrderForPosition never returns an existing
  // neighbour's own value in the interior of a column).
  const anchorIndex = anchor ? siblings.findIndex(task => task.id === anchor.id) : -1;
  const insertAt = anchorIndex >= 0
    ? anchorIndex + (anchor!.side === "after" ? 1 : 0)
    : siblings.findIndex((task) => task.sort_order !== null && task.sort_order > rawSortOrder);
  const ordered =
    insertAt === -1
      ? [...siblings, { id: movingTaskId, sort_order: rawSortOrder }]
      : [...siblings.slice(0, insertAt), { id: movingTaskId, sort_order: rawSortOrder }, ...siblings.slice(insertAt)];

  return ordered.map((task, index) => ({ id: task.id, sort_order: (index + 1) * RENUMBER_SPACING }));
}
