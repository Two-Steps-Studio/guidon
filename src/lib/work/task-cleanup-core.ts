import { editDistance, normalizeText } from "@/lib/search/task-search-core";

/** What a cleanup review needs to know about each task. */
export interface CleanupTask {
  id: string;
  title: string;
  status: string;
  is_done: boolean;
  parent_task_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  updated_at: string;
}

export interface DuplicateGroup<T extends CleanupTask = CleanupTask> {
  /** The task to keep: an open one over a done one, then the most recently touched. */
  keep: T;
  duplicates: T[];
}

export interface CleanupReport<T extends CleanupTask = CleanupTask> {
  duplicates: DuplicateGroup<T>[];
  /** Open tasks nobody touched for STALE_DAYS. */
  stale: T[];
  /** Open tasks past their due date. */
  overdue: T[];
  /** In progress with nobody assigned. */
  unassignedInProgress: T[];
}

export const STALE_DAYS = 60;
const DAY_MS = 86_400_000;
const IN_PROGRESS = new Set(["in_progress", "ai_working"]);

/** A title in the forms the comparison needs, computed once per task. */
interface PreparedTitle {
  text: string;
  words: Set<string>;
  numbers: string;
}

function prepare(title: string): PreparedTitle {
  const text = normalizeText(title);
  return { text, words: new Set(text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)), numbers: (text.match(/\d+/g) ?? []).join(" ") };
}

/**
 * Two titles that likely mean the same task: equal once normalized, at most
 * two typos apart (titles of 12+ letters), or sharing 80% of their words
 * when both have at least three - and never when their numbers differ
 * ("Bug 12" and "Bug 13" are two bugs). Deliberately strict: a false
 * "duplicate" costs a person's time, a missed one only stays as it was.
 */
function similar(a: PreparedTitle, b: PreparedTitle): boolean {
  if (!a.text || !b.text || a.numbers !== b.numbers) return false;
  if (a.text === b.text) return true;
  if (Math.min(a.text.length, b.text.length) >= 12 && editDistance(a.text, b.text, 2) <= 2) return true;
  if (a.words.size < 3 || b.words.size < 3) return false;
  let shared = 0;
  a.words.forEach((word) => b.words.has(word) && shared++);
  return shared / (a.words.size + b.words.size - shared) >= 0.8;
}

export function similarTitles(a: string, b: string): boolean {
  return similar(prepare(a), prepare(b));
}

/** Keep the open one over a done one, then the one touched most recently. */
function pickKeeper<T extends CleanupTask>(tasks: T[]): T {
  return [...tasks].sort((x, y) => Number(x.is_done) - Number(y.is_done) || y.updated_at.localeCompare(x.updated_at))[0];
}

/**
 * Likely duplicates (only between siblings - top-level with top-level,
 * subtasks under the same parent - since "Write tests" under two features
 * is not a repeat), plus open tasks that are stale, overdue or in progress
 * with nobody on them. Read-only: what to do about it is for the person
 * (or the agent asking them).
 */
export function reviewTasks<T extends CleanupTask>(tasks: readonly T[], now: Date): CleanupReport<T> {
  const groups: T[][] = [];
  const grouped = new Set<string>();
  const titles = tasks.map((task) => prepare(task.title));
  for (let i = 0; i < tasks.length; i++) {
    if (grouped.has(tasks[i].id)) continue;
    const group = [tasks[i]];
    for (let j = i + 1; j < tasks.length; j++) {
      const other = tasks[j];
      if (grouped.has(other.id) || other.parent_task_id !== tasks[i].parent_task_id) continue;
      if (similar(titles[i], titles[j])) group.push(other);
    }
    // Only groups with an open task matter: two done twins are history.
    if (group.length > 1 && group.some((task) => !task.is_done)) {
      group.forEach((task) => grouped.add(task.id));
      groups.push(group);
    }
  }

  const open = tasks.filter((task) => !task.is_done);
  const today = now.toISOString().slice(0, 10);
  return {
    duplicates: groups.map((group) => {
      const keep = pickKeeper(group);
      return { keep, duplicates: group.filter((task) => task !== keep) };
    }),
    stale: open.filter((task) => now.getTime() - new Date(task.updated_at).getTime() > STALE_DAYS * DAY_MS),
    overdue: open.filter((task) => task.due_date !== null && task.due_date.slice(0, 10) < today),
    unassignedInProgress: open.filter((task) => IN_PROGRESS.has(task.status) && !task.assignee_id),
  };
}

/** The report as text an AI reads (ids included) - empty sections left out. */
export function formatCleanupReport(report: CleanupReport, totalTasks: number): string {
  const line = (task: CleanupTask) =>
    `- ${task.title} (id ${task.id}; ${task.is_done ? "done" : task.status}${task.due_date ? `, due ${task.due_date.slice(0, 10)}` : ""}, updated ${task.updated_at.slice(0, 10)})`;
  const sections: string[] = [];
  if (report.duplicates.length) {
    sections.push(
      `Likely duplicates (${report.duplicates.length} group(s)) - check they really are the same before merging:\n` +
        report.duplicates
          .map((group) => `Keep:\n  ${line(group.keep)}\n  Duplicates:\n${group.duplicates.map((task) => `  ${line(task)}`).join("\n")}`)
          .join("\n")
    );
  }
  if (report.overdue.length) sections.push(`Overdue (${report.overdue.length}):\n${report.overdue.map(line).join("\n")}`);
  if (report.stale.length) sections.push(`Not touched for ${STALE_DAYS}+ days (${report.stale.length}):\n${report.stale.map(line).join("\n")}`);
  if (report.unassignedInProgress.length) {
    sections.push(`In progress with nobody assigned (${report.unassignedInProgress.length}):\n${report.unassignedInProgress.map(line).join("\n")}`);
  }
  return sections.length ? `Reviewed ${totalTasks} task(s).\n\n${sections.join("\n\n")}` : `Reviewed ${totalTasks} task(s): nothing to clean up.`;
}
