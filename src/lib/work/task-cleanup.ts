import "server-only";

import type { DataClient } from "@/lib/data-client";
import { formatCleanupReport, reviewTasks, type CleanupReport, type CleanupTask } from "./task-cleanup-core";

/** Most recently touched tasks a review reads; older ones beyond this are left out. */
const REVIEW_LIMIT = 2000;

type Row = Omit<CleanupTask, "due_date" | "updated_at"> & { due_date: string | Date | null; updated_at: string | Date };

/** pg hands `date` back as local midnight and timestamps as Date; the review compares ISO text. */
function isoDate(value: string | Date | null): string | null {
  if (!(value instanceof Date)) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/**
 * Reads a project's tasks as the caller (RLS decides what it may see) and
 * reviews them for cleanup. `db` is the caller's data client - dataClient
 * for the chat, apiDataClient for API keys.
 */
export async function loadCleanupReport(
  db: DataClient,
  projectId: string,
  now = new Date()
): Promise<{ report: CleanupReport; total: number; text: string; error: null } | { error: string }> {
  const { data, error } = await db
    .from("tasks")
    .select<Row>("id, title, status, is_done, parent_task_id, assignee_id, due_date, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(REVIEW_LIMIT);
  if (error) return { error: error.message };
  const tasks: CleanupTask[] = (data ?? []).map((row) => ({
    ...row,
    due_date: isoDate(row.due_date),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }));
  const report = reviewTasks(tasks, now);
  return { report, total: tasks.length, text: formatCleanupReport(report, tasks.length), error: null };
}
