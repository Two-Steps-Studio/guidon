"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { getWorkflowOverridesFor } from "@/lib/data/workflow";
import { resolveBoardColumns } from "@/lib/work/task-board";
import { createTask, type TaskActionResult } from "@/app/projects/[id]/work/actions";
import type { Task, TaskStatus } from "@/types/task";

/**
 * Quick add from My tasks: a title, a project and optionally "due today".
 * The task is assigned to the person adding it (so it shows up in this list)
 * and goes to the end of the project's To do column - or its first visible
 * column when To do is hidden. Permissions, limits, the idempotent client id
 * and the activity log are createTask's, unchanged.
 */
export async function quickAddTask(
  projectId: string,
  input: { title: string; dueDate: string; clientId: string }
): Promise<TaskActionResult> {
  const user = await getCurrentUser();
  const db = dataClient(user.id);
  const workflow = (await getWorkflowOverridesFor(user.id, [projectId])).get(projectId);
  const columns = resolveBoardColumns(workflow?.columns ?? []);
  const status: TaskStatus = (columns.find((column) => column.status === "todo") ?? columns[0])?.status ?? "todo";
  const { data: last } = await db
    .from<Pick<Task, "sort_order">>("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .eq("status", status)
    .order("sort_order", { ascending: false })
    // Descending puts NULL sort_orders first in Postgres; a few rows skip them.
    .limit(20);
  const result = await createTask(projectId, {
    title: input.title,
    description: "",
    status,
    priority: "medium",
    assigneeId: user.id,
    dueDate: input.dueDate,
    sortOrder: Math.max(0, ...(last ?? []).map((row) => row.sort_order ?? 0)) + 100,
    clientId: input.clientId,
  });
  if (result.task) revalidatePath("/my-tasks");
  return result;
}
