import type { BuiltinStatus, Column, Priority, Task } from "@/api";
import { BUILTIN_PRIORITIES, BUILTIN_STATUSES, WORKFLOW_KEY_RE } from "@/api";
import { t, tOptional } from "@/i18n";
import type { Colors } from "@/theme";

/**
 * Board logic ported from src/lib/work/task-board.ts in the main repo, so the
 * phone groups and orders cards exactly like the web board.
 */

const LEGACY_STATUS: Record<string, BuiltinStatus> = { testing: "review", completed: "done" };

const DEFAULT_COLUMN_LABELS: Record<BuiltinStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  ai_working: "AI Working",
  review: "Review",
  done: "Done",
};

const DEFAULT_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const BUILTIN_PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function normalizeStatus(status: string | null | undefined): string {
  if (!status) return "backlog";
  const legacy = LEGACY_STATUS[status];
  if (legacy) return legacy;
  return WORKFLOW_KEY_RE.test(status) ? status : "backlog";
}

export function isBuiltinStatus(status: string): status is BuiltinStatus {
  return (BUILTIN_STATUSES as readonly string[]).includes(status);
}

/**
 * Column labels come from the API in English unless the project renamed them;
 * an unrenamed built-in column is shown in the phone's language instead.
 */
export function columnLabel(column: Pick<Column, "status" | "label" | "custom">): string {
  if (!column.custom && isBuiltinStatus(column.status) && column.label === DEFAULT_COLUMN_LABELS[column.status]) {
    return tOptional(`columns.${column.status}`) ?? column.label;
  }
  return column.label;
}

export function statusLabel(status: string, columns: readonly Column[] | undefined): string {
  const normalized = normalizeStatus(status);
  const column = columns?.find((c) => c.status === normalized);
  if (column) return columnLabel(column);
  if (isBuiltinStatus(normalized)) return t(`columns.${normalized}`);
  return normalized;
}

export function columnColor(column: Pick<Column, "status" | "color">, colors: Colors): string {
  if (column.color) return column.color;
  switch (column.status) {
    case "todo":
    case "ai_working":
      return colors.info;
    case "in_progress":
      return colors.warning;
    case "review":
      return colors.primary;
    case "done":
      return colors.success;
    default:
      return colors.textMuted;
  }
}

function isBuiltinPriority(key: string): boolean {
  return (BUILTIN_PRIORITIES as readonly string[]).includes(key);
}

export function priorityLabel(key: string, priorities: readonly Priority[] | undefined): string {
  const def = priorities?.find((p) => p.key === key);
  if (def && !(isBuiltinPriority(key) && !def.custom && def.label === DEFAULT_PRIORITY_LABELS[key])) return def.label;
  if (isBuiltinPriority(key)) return tOptional(`priorities.${key}`) ?? key;
  return def?.label ?? key;
}

export function priorityColor(key: string, priorities: readonly Priority[] | undefined, colors: Colors): string {
  const def = priorities?.find((p) => p.key === key);
  if (def?.color) return def.color;
  if (key in colors.priority) return colors.priority[key as keyof Colors["priority"]];
  return colors.textMuted;
}

/** Lower = more important. The API returns priorities most important first. */
function priorityRank(key: string, priorities: readonly Priority[] | undefined): number {
  const index = priorities?.findIndex((p) => p.key === key) ?? -1;
  if (index >= 0) return index;
  return BUILTIN_PRIORITY_RANK[key] ?? 1.5;
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** sort_order, then priority, then creation time - same as taskComparator on the web. */
export function compareTasks(priorities: readonly Priority[] | undefined) {
  return (a: Task, b: Task): number => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const byPriority = priorityRank(a.priority, priorities) - priorityRank(b.priority, priorities);
    if (byPriority !== 0) return byPriority;
    return timestamp(a.created_at) - timestamp(b.created_at);
  };
}

export type SubtaskProgress = { done: number; total: number };

export type BoardData = {
  /** Top-level tasks per visible column key, sorted. */
  byColumn: Record<string, Task[]>;
  progress: Map<string, SubtaskProgress>;
};

export function isTaskDone(task: Task, columns: readonly Column[] | undefined): boolean {
  if (typeof task.is_done === "boolean") return task.is_done;
  const status = normalizeStatus(task.status);
  return columns?.find((c) => c.status === status)?.is_done ?? status === "done";
}

export function buildBoard(
  tasks: readonly Task[],
  columns: readonly Column[],
  priorities: readonly Priority[] | undefined
): BoardData {
  const byColumn: Record<string, Task[]> = {};
  for (const column of columns) byColumn[column.status] = [];
  const progress = new Map<string, SubtaskProgress>();

  for (const task of tasks) {
    if (task.parent_task_id) {
      const entry = progress.get(task.parent_task_id) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (isTaskDone(task, columns)) entry.done += 1;
      progress.set(task.parent_task_id, entry);
      continue;
    }
    // A task in a hidden column stays off the board, like on the web.
    byColumn[normalizeStatus(task.status)]?.push(task);
  }

  const compare = compareTasks(priorities);
  for (const key of Object.keys(byColumn)) byColumn[key]?.sort(compare);
  return { byColumn, progress };
}

export function initials(nameOrEmail: string | null | undefined): string {
  const source = (nameOrEmail ?? "").trim();
  if (!source) return "?";
  const base = source.includes("@") && !source.includes(" ") ? (source.split("@")[0] ?? source) : source;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : base.slice(0, 2);
  return letters.toUpperCase();
}

export const TEMP_ID_PREFIX = "local-";

/** A task or comment created on the phone that the server hasn't confirmed yet. */
export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}
