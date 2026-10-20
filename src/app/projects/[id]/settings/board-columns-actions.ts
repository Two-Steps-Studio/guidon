"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { TASK_PRIORITIES, TASK_STATUSES, WORKFLOW_KEY_RE, isBuiltinPriority, isBuiltinStatus } from "@/lib/work/task-board";

/**
 * Board columns and priorities are saved as a whole list (settings forms):
 * every built-in entry must be there, custom ones (migration 060) can be
 * added - with a new key - or left out to delete them. Deleting a custom
 * column/priority that tasks still use is refused by the database
 * (protect_used_workflow_values) and reported here in words.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const IN_USE = "23503";

export interface BoardColumnInput {
  status: string;
  label: string;
  sort_order: number;
  hidden: boolean;
  /** Custom columns only; the built-in Done is always done. */
  is_done: boolean;
  color: string | null;
}

export interface PriorityInput {
  key: string;
  label: string;
  color: string | null;
  hidden: boolean;
}

export type WorkflowSaveState = { error: string | null };
/** Kept for existing imports. */
export type BoardColumnsState = WorkflowSaveState;

function validateList<T>(
  rows: T[],
  keyOf: (row: T) => string,
  builtins: readonly string[],
  labelOf: (row: T) => string,
  colorOf: (row: T) => string | null
): string | null {
  const keys = rows.map(keyOf);
  if (new Set(keys).size !== keys.length) return "Two entries have the same key.";
  if (builtins.some((key) => !keys.includes(key))) return "The built-in entries can be hidden but not removed.";
  if (rows.length > builtins.length + 30) return "That's too many - at most 30 of your own.";
  for (const row of rows) {
    const key = keyOf(row);
    if (!WORKFLOW_KEY_RE.test(key)) return `Invalid key "${key}".`;
    if (!builtins.includes(key) && !labelOf(row).trim()) return "Give every new entry a name.";
    if (labelOf(row).length > 50) return "Names can be up to 50 characters.";
    const color = colorOf(row);
    if (color !== null && !HEX.test(color)) return "Invalid colour.";
  }
  return null;
}

export async function updateBoardColumns(projectId: string, columns: BoardColumnInput[]): Promise<WorkflowSaveState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change this project's board layout." };
  }
  const invalid = validateList(columns, (c) => c.status, TASK_STATUSES, (c) => c.label, (c) => c.color);
  if (invalid) return { error: invalid };
  if (columns.every((c) => c.hidden)) return { error: "At least one column must stay visible." };

  const db = dataClient(access.userId);

  const hidden = columns.filter((c) => c.hidden).map((c) => c.status);
  if (hidden.length) {
    const { data: occupied, error } = await db
      .from<{ status: string }>("tasks")
      .select("status")
      .eq("project_id", projectId)
      .in("status", hidden)
      .limit(1);
    if (error) return { error: error.message };
    if (occupied.length) {
      const label = columns.find((c) => c.status === occupied[0].status)?.label || occupied[0].status;
      return { error: `Move tasks out of "${label}" before hiding that column.` };
    }
  }

  const { data: existing, error: existingError } = await db
    .from<{ status: string }>("project_board_columns")
    .select("status")
    .eq("project_id", projectId);
  if (existingError) return { error: existingError.message };
  const removed = existing.map((row) => row.status).filter((status) => !isBuiltinStatus(status) && !columns.some((c) => c.status === status));
  if (removed.length) {
    const { error } = await db.from("project_board_columns").delete().eq("project_id", projectId).in("status", removed);
    if (error) return { error: error.code === IN_USE ? "A removed column still has tasks - move them first." : error.message };
  }

  for (const column of columns) {
    const custom = !isBuiltinStatus(column.status);
    const { error } = await db.upsertRow("project_board_columns", {
      key: { project_id: projectId, status: column.status },
      set: {
        label: column.label.trim() || null,
        sort_order: column.sort_order,
        hidden: column.hidden,
        is_done: custom ? column.is_done : column.status === "done",
        color: column.color,
        updated_at: new Date().toISOString(),
      },
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function updatePriorities(projectId: string, priorities: PriorityInput[]): Promise<WorkflowSaveState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change this project's priorities." };
  }
  const invalid = validateList(priorities, (p) => p.key, TASK_PRIORITIES, (p) => p.label, (p) => p.color);
  if (invalid) return { error: invalid };
  if (priorities.every((p) => p.hidden)) return { error: "At least one priority must stay visible." };

  const db = dataClient(access.userId);
  const { data: existing, error: existingError } = await db
    .from<{ key: string }>("project_task_priorities")
    .select("key")
    .eq("project_id", projectId);
  if (existingError) return { error: existingError.message };
  const removed = existing.map((row) => row.key).filter((key) => !isBuiltinPriority(key) && !priorities.some((p) => p.key === key));
  if (removed.length) {
    const { error } = await db.from("project_task_priorities").delete().eq("project_id", projectId).in("key", removed);
    if (error) return { error: error.code === IN_USE ? "Tasks still use a removed priority - change them first." : error.message };
  }

  // List order is importance: rank 0 = most important.
  for (const [rank, priority] of priorities.entries()) {
    const { error } = await db.upsertRow("project_task_priorities", {
      key: { project_id: projectId, key: priority.key },
      set: {
        label: priority.label.trim() || null,
        color: priority.color,
        rank,
        hidden: priority.hidden,
        updated_at: new Date().toISOString(),
      },
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}
