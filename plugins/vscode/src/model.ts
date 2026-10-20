/** Guidon's task vocabulary and board rules - no vscode import, so it runs (and is tested) in plain Node. */

export interface Project {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[] | null;
  due_date: string | null;
  sort_order: number | null;
  parent_task_id: string | null;
  created_at: string;
  /** Whether the task's column counts as finished (servers with migration 060); absent on older servers. */
  is_done?: boolean;
}

export interface Comment {
  id: string;
  content: string;
  created_at: string;
  actor_label: string | null;
}

/** A moodboard image (GET /api/v1/projects/{id}/references). `image_url` is short-lived - download it right away. */
export interface Reference {
  id: string;
  name: string;
  caption: string | null;
  tags: string[];
  source_url: string | null;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
  image_url: string | null;
}

export interface Column {
  status: string;
  label: string;
  /** Tasks in this column count as finished - always true for `done`, optional for a project's own columns. */
  is_done: boolean;
  /** Hex colour for the column dot, or null for the built-in one. */
  color: string | null;
}

/** A task priority (GET /api/v1/projects/{id}/priorities), most important first. */
export interface Priority {
  key: string;
  label: string;
  /** Hex colour, or null for the built-in colour of a built-in key (grey for anything else). */
  color: string | null;
}

/** Mirrors src/lib/work/task-board.ts (BOARD_COLUMNS / TASK_PRIORITIES) - a manual-sync point, like every plugin. */
export const STATUSES = ["backlog", "todo", "in_progress", "ai_working", "review", "done"] as const;
export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  ai_working: "AI Working",
  review: "Review",
  done: "Done",
};
/** Built-in priorities, most important first - what a project without its own (or an older server) has. */
export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/** What a project's own status/priority keys look like (WORKFLOW_KEY_RE, migration 060). */
export const WORKFLOW_KEY = /^[a-z][a-z0-9_]{0,39}$/;
/** Colours are only ever passed on as CSS, so anything but a hex colour is dropped. */
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const DEFAULT_COLUMNS: Column[] = STATUSES.map((status) => ({ status, label: STATUS_LABELS[status], is_done: status === "done", color: null }));
export const DEFAULT_PRIORITIES: Priority[] = PRIORITIES.map((key) => ({ key, label: PRIORITY_LABELS[key], color: null }));

/** Whether a status counts as finished: a column marked is_done, or the built-in done. */
export function isDoneStatus(columns: Column[], status: string): boolean {
  return status === "done" || columns.some((column) => column.status === status && column.is_done);
}

/** The task's own is_done when the server sends it, else derived from its column. */
export function isTaskDone(task: Pick<Task, "status" | "is_done">, columns: Column[]): boolean {
  return typeof task.is_done === "boolean" ? task.is_done : isDoneStatus(columns, task.status);
}

/**
 * The visible columns plus one per status a top-level task carries that none
 * of them has (a column removed or hidden since), so no task ever drops off
 * the board. Such a column is labelled with its key.
 */
export function boardColumns(columns: Column[], tasks: Task[]): Column[] {
  const known = new Set(columns.map((column) => column.status));
  const extra: Column[] = [];
  for (const task of tasks) {
    if (task.parent_task_id || !task.status || known.has(task.status)) continue;
    known.add(task.status);
    extra.push({ status: task.status, label: STATUS_LABELS[task.status] ?? task.status, is_done: isTaskDone(task, columns), color: null });
  }
  return extra.length ? [...columns, ...extra] : columns;
}

/** Importance of a priority key: its index in the project's list, unknown keys after all known ones. */
export function priorityRank(priorities: Priority[], key: string): number {
  const index = priorities.findIndex((priority) => priority.key === key);
  return index >= 0 ? index : priorities.length;
}

/** Board order within a column: sort_order, then priority (when given), ties keep the API's newest-first order. */
export function columnTasks(tasks: Task[], status: string, priorities: Priority[] = []): Task[] {
  const rank = (task: Task) => (priorities.length ? priorityRank(priorities, task.priority) : 0);
  return tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status === status && !task.parent_task_id)
    .sort((a, b) => (a.task.sort_order ?? 0) - (b.task.sort_order ?? 0) || rank(a.task) - rank(b.task) || a.index - b.index)
    .map(({ task }) => task);
}

export function subtasks(tasks: Task[], parentId: string): Task[] {
  return tasks.filter((task) => task.parent_task_id === parentId).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Append case of sortOrderForPosition: a card dropped at the end of a column goes 100 past the last one. */
export function appendSortOrder(column: Task[]): number {
  if (column.length === 0) return 1000;
  return Math.max(...column.map((task) => task.sort_order ?? 0)) + 100;
}

/** `guidon#1a2b3c4d` - what the GitHub integration recognises in commits, PRs and branch names. */
export function gitRef(taskId: string): string {
  return `guidon#${taskId.slice(0, 8).toLowerCase()}`;
}

/**
 * A branch name for a task: `<prefix>guidon-1a2b3c4d-short-title`. The dash
 * form of the reference because `#` isn't valid in every branch-naming
 * scheme; the GitHub integration recognises both.
 */
/** Letters NFKD doesn't decompose into ASCII (Polish ł, German ß, Nordic ø/æ...). */
const TRANSLITERATE: Record<string, string> = { ł: "l", Ł: "L", ß: "ss", ø: "o", Ø: "O", æ: "ae", Æ: "AE", đ: "d", Đ: "D", þ: "th", œ: "oe", Œ: "OE" };

export function branchName(task: Pick<Task, "id" | "title">, prefix = ""): string {
  const slug = task.title
    .replace(/[łŁßøØæÆđĐþœŒ]/g, (c) => TRANSLITERATE[c])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const cleanPrefix = prefix.trim().replace(/[^A-Za-z0-9/_.-]/g, "");
  return `${cleanPrefix}guidon-${task.id.slice(0, 8).toLowerCase()}${slug ? `-${slug}` : ""}`;
}

/** Adds the reference to a commit message unless it's already there. */
export function withRef(message: string, taskId: string): string {
  const ref = gitRef(taskId);
  if (message.toLowerCase().includes(ref)) return message;
  const trimmed = message.replace(/\s+$/, "");
  return trimmed ? `${trimmed} ${ref}` : `${ref} `;
}

export function isValidDueDate(value: string): boolean {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
