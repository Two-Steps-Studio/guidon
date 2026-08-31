/**
 * Guidon work module - board vocabulary and helpers.
 *
 * Single source of truth for how tasks are grouped, ordered, labelled and
 * coloured. Pages should import from here rather than redeclaring column
 * definitions, so the board, the task dialog and the overview widgets can
 * never drift apart.
 */

import type {
  LegacyTaskStatus,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types/task";

// ============================================
// STATUS
// ============================================

export interface BoardColumn {
  status: TaskStatus;
  label: string;
  /** Short helper shown when the column is empty. */
  hint: string;
  /** Tailwind class for the column's accent dot. */
  accentClass: string;
}

/**
 * Column order defines the workflow left-to-right. Statuses are intended to
 * become project-configurable; until then this constant is the default set.
 */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    status: "backlog",
    label: "Backlog",
    hint: "Unscheduled work",
    accentClass: "bg-muted-foreground",
  },
  {
    status: "todo",
    label: "Todo",
    hint: "Ready to pick up",
    accentClass: "bg-info",
  },
  {
    status: "in_progress",
    label: "In Progress",
    hint: "Being worked on",
    accentClass: "bg-warning",
  },
  {
    status: "ai_working",
    label: "AI Working",
    hint: "An AI agent is working on this",
    accentClass: "bg-info",
  },
  {
    status: "review",
    label: "Review",
    hint: "Awaiting review",
    accentClass: "bg-primary",
  },
  {
    status: "done",
    label: "Done",
    hint: "Shipped",
    accentClass: "bg-success",
  },
] as const;

export const TASK_STATUSES: readonly TaskStatus[] = BOARD_COLUMNS.map(
  (column) => column.status
);

export interface BoardColumnOverride {
  status: TaskStatus;
  label: string | null;
  sort_order: number;
  hidden: boolean;
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
export function resolveBoardColumns(
  overrides: readonly BoardColumnOverride[]
): BoardColumn[] {
  const overrideByStatus = new Map(overrides.map((o) => [o.status, o]));

  return BOARD_COLUMNS.map((column, index) => {
    const override = overrideByStatus.get(column.status);
    return {
      column: { ...column, label: override?.label ?? column.label },
      sortOrder: override?.sort_order ?? index,
      hidden: override?.hidden ?? false,
    };
  })
    .filter((entry) => !entry.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.column);
}

/**
 * Rows written before migration 002 still carry the old vocabulary. Fold them
 * onto the current statuses so the board renders correctly either way.
 */
const LEGACY_STATUS_MAP: Record<LegacyTaskStatus, TaskStatus> = {
  testing: "review",
  completed: "done",
};

export function normalizeTaskStatus(
  status: TaskStatus | LegacyTaskStatus | string | null | undefined
): TaskStatus {
  if (!status) return "backlog";

  if ((TASK_STATUSES as readonly string[]).includes(status)) {
    return status as TaskStatus;
  }

  const mapped = LEGACY_STATUS_MAP[status as LegacyTaskStatus];
  return mapped ?? "backlog";
}

export function statusLabel(
  status: TaskStatus | LegacyTaskStatus | string
): string {
  const normalized = normalizeTaskStatus(status);
  return (
    BOARD_COLUMNS.find((column) => column.status === normalized)?.label ??
    normalized
  );
}

export function isDone(
  status: TaskStatus | LegacyTaskStatus | string
): boolean {
  return normalizeTaskStatus(status) === "done";
}

// ============================================
// PRIORITY
// ============================================

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * Restrained treatment: a coloured rule plus muted text, rather than a
 * saturated pill on every card. Keeps a dense board readable.
 */
export const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low: "text-priority-low border-priority-low/30",
  medium: "text-priority-medium border-priority-medium/40",
  high: "text-priority-high border-priority-high/50",
  critical: "text-priority-critical border-priority-critical/60",
};

export const PRIORITY_DOT_CLASSES: Record<TaskPriority, string> = {
  low: "bg-priority-low",
  medium: "bg-priority-medium",
  high: "bg-priority-high",
  critical: "bg-priority-critical",
};

export function normalizeTaskPriority(
  priority: string | null | undefined
): TaskPriority {
  if (priority && (TASK_PRIORITIES as readonly string[]).includes(priority)) {
    return priority as TaskPriority;
  }
  return "medium";
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ============================================
// GROUPING / ORDERING
// ============================================

export type TasksByStatus = Record<TaskStatus, Task[]>;

function emptyGroups(): TasksByStatus {
  return {
    backlog: [],
    todo: [],
    in_progress: [],
    ai_working: [],
    review: [],
    done: [],
  };
}

/**
 * Group tasks into board columns, ordered by sort_order then priority then
 * creation time. Tasks with an unknown status land in Backlog rather than
 * disappearing from the board.
 */
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

// ============================================
// PROGRESS
// ============================================

export interface BoardProgress {
  total: number;
  done: number;
  inFlight: number;
  percent: number;
}

export function boardProgress(tasks: Task[]): BoardProgress {
  const total = tasks.length;
  const done = tasks.filter((task) => isDone(task.status)).length;
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
}

export function subtaskProgress(subtasks: Task[]): SubtaskProgress {
  return {
    done: subtasks.filter((task) => isDone(task.status)).length,
    total: subtasks.length,
  };
}

// ============================================
// DUE DATES
// ============================================

export type DueState = "none" | "upcoming" | "soon" | "overdue";

export function dueState(
  dueDate: string | null,
  status: TaskStatus | LegacyTaskStatus | string
): DueState {
  if (!dueDate || isDone(status)) return "none";

  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return "none";

  const dayMs = 24 * 60 * 60 * 1000;
  const delta = due - Date.now();

  if (delta < 0) return "overdue";
  if (delta < 2 * dayMs) return "soon";
  return "upcoming";
}

export const DUE_STATE_CLASSES: Record<DueState, string> = {
  none: "text-muted-foreground",
  upcoming: "text-muted-foreground",
  soon: "text-warning",
  overdue: "text-danger",
};

export function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

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
  siblings: { id: string; sort_order: number }[],
  movingTaskId: string,
  rawSortOrder: number
): { id: string; sort_order: number }[] | null {
  const rounded = Math.round(rawSortOrder);
  const collides = siblings.some((task) => task.sort_order === rounded);
  if (!collides) return null;

  // Where the moving task ranks among the current siblings - not by the
  // rounded integer (that's exactly the value in collision), but by the
  // original float, which is only ever equal to an existing sort_order at
  // the boundaries (sortOrderForPosition never returns an existing
  // neighbour's own value in the interior of a column).
  const insertAt = siblings.findIndex((task) => task.sort_order > rawSortOrder);
  const ordered =
    insertAt === -1
      ? [...siblings, { id: movingTaskId, sort_order: rawSortOrder }]
      : [...siblings.slice(0, insertAt), { id: movingTaskId, sort_order: rawSortOrder }, ...siblings.slice(insertAt)];

  return ordered.map((task, index) => ({ id: task.id, sort_order: (index + 1) * RENUMBER_SPACING }));
}
