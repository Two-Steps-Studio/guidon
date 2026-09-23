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
}

export interface Comment {
  id: string;
  content: string;
  created_at: string;
  actor_label: string | null;
}

export interface Column {
  status: string;
  label: string;
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
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const DEFAULT_COLUMNS: Column[] = STATUSES.map((status) => ({ status, label: STATUS_LABELS[status] }));

/** Board order within a column: sort_order, ties keep the API's newest-first order. */
export function columnTasks(tasks: Task[], status: string): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status === status && !task.parent_task_id)
    .sort((a, b) => (a.task.sort_order ?? 0) - (b.task.sort_order ?? 0) || a.index - b.index)
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
