"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { createNotification } from "@/lib/data/notifications";
import { emitTaskEvent } from "@/lib/events/task-events";
import { isValidUuid } from "@/lib/api/validate-id";
import { TASK_STATUSES } from "@/lib/work/task-board";
import type { TaskStatus } from "@/types/task";

/** Far more than anyone selects by hand; keeps one request bounded. */
const MAX_BULK_TASKS = 200;
/** Gap between appended cards, same spacing new cards get at the end of a column. */
const SORT_STEP = 1000;

export type BulkOperation =
  | { kind: "move"; status: TaskStatus }
  | { kind: "assign"; assigneeId: string | null }
  | { kind: "label"; label: string; add: boolean }
  | { kind: "delete" };

export type BulkResult = { error: string | null; count: number };

/**
 * One operation on several board cards at once (Ctrl/Cmd/Shift-click selection
 * on the Kanban board). Move, assign and delete are one statement each over
 * the whole selection, scoped by project_id; labels need each task's own tag
 * list, so they're one read plus one update per task that actually changes.
 * Either way the board gets a single activity-log entry and one revalidation
 * instead of one per card. RLS (tasks_update/tasks_delete) stays the real
 * gate; the role checks here only give a readable error.
 */
export async function bulkUpdateTasks(projectId: string, taskIds: string[], operation: BulkOperation): Promise<BulkResult> {
  const ids = [...new Set(Array.isArray(taskIds) ? taskIds : [])].filter((id) => typeof id === "string" && isValidUuid(id));
  if (ids.length === 0) return { error: "No tasks selected.", count: 0 };
  if (ids.length > MAX_BULK_TASKS) return { error: `Select at most ${MAX_BULK_TASKS} tasks at once.`, count: 0 };

  const access = await getProjectAccess(projectId);
  const allowed = operation.kind === "delete" ? canManageProject : canWriteProject;
  if (!access || !allowed(access.role)) {
    return { error: "You do not have permission to change these tasks.", count: 0 };
  }
  const db = dataClient(access.userId);

  let count = 0;
  let details: Record<string, unknown> = {};

  switch (operation.kind) {
    case "move": {
      if (!TASK_STATUSES.includes(operation.status)) return { error: "Unknown status.", count: 0 };
      // Appended after the target column's last card, in the order selected.
      const { data: last, error: lastError } = await db
        .from<{ sort_order: number }>("tasks")
        .select("sort_order")
        .eq("project_id", projectId)
        .eq("status", operation.status)
        .is("parent_task_id", null)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (lastError) return { error: lastError.message, count: 0 };
      const base = (last[0]?.sort_order ?? 0) + SORT_STEP;

      const { data: moved, error } = await db
        .from<{ id: string; title: string }>("tasks")
        .update({ status: operation.status })
        .in("id", ids)
        .eq("project_id", projectId)
        .select("id, title");
      if (error) return { error: error.message, count: 0 };
      count = moved.length;
      if (count === 0) break;

      const order = ids.filter((id) => moved.some((task) => task.id === id));
      const { error: renumberError } = await db.rpc("renumber_task_sort_orders", {
        p_ids: order,
        p_sort_orders: order.map((_, index) => base + index * SORT_STEP),
        p_project_id: projectId,
      });
      // Only the position is off if this fails - the cards are already in
      // the right column - so it isn't reported as a failed move.
      if (renumberError) console.error("bulkUpdateTasks: renumbering failed:", renumberError);

      // Integrations (Discord, webhooks) hear about each card, as for a drag.
      for (const task of moved) {
        emitTaskEvent(
          projectId,
          access.userId,
          operation.status === "done"
            ? { kind: "completed", taskId: task.id, title: task.title }
            : { kind: "status_changed", taskId: task.id, title: task.title, status: operation.status }
        );
      }
      details = { operation: "move", status: operation.status };
      break;
    }

    case "assign": {
      const assigneeId = operation.assigneeId;
      if (assigneeId !== null && !isValidUuid(assigneeId)) return { error: "Unknown member.", count: 0 };
      const { data: updated, error } = await db
        .from<{ id: string }>("tasks")
        .update({ assignee_id: assigneeId })
        .in("id", ids)
        .eq("project_id", projectId)
        .select("id");
      if (error) return { error: error.message, count: 0 };
      count = updated.length;
      if (count > 0 && assigneeId && assigneeId !== access.userId) {
        createNotification({
          userId: assigneeId,
          projectId,
          type: "task_assigned",
          title: count === 1 ? "A task was assigned to you" : `${count} tasks were assigned to you`,
          link: count === 1 ? `/projects/${projectId}/work?openTask=${updated[0].id}` : "/my-tasks",
        });
      }
      details = { operation: "assign", assignee_id: assigneeId };
      break;
    }

    case "label": {
      const label = typeof operation.label === "string" ? operation.label.trim() : "";
      if (!label || label.length > 50) return { error: "Enter a label (up to 50 characters).", count: 0 };
      const { data: rows, error } = await db
        .from<{ id: string; tags: string[] | null }>("tasks")
        .select("id, tags")
        .in("id", ids)
        .eq("project_id", projectId);
      if (error) return { error: error.message, count: 0 };
      for (const row of rows) {
        const tags = row.tags ?? [];
        const has = tags.includes(label);
        if (has === operation.add) continue;
        const next = operation.add ? [...tags, label] : tags.filter((tag) => tag !== label);
        const { data: updated, error: updateError } = await db
          .from<{ id: string }>("tasks")
          .update({ tags: next })
          .eq("id", row.id)
          .eq("project_id", projectId)
          .select("id");
        if (updateError) return { error: updateError.message, count };
        count += updated.length;
      }
      details = { operation: operation.add ? "label_add" : "label_remove", label };
      break;
    }

    case "delete": {
      const { data: deleted, error } = await db
        .from<{ id: string }>("tasks")
        .delete()
        .in("id", ids)
        .eq("project_id", projectId)
        .select("id");
      if (error) return { error: error.message, count: 0 };
      count = deleted.length;
      details = { operation: "delete" };
      break;
    }

    default:
      return { error: "Unknown operation.", count: 0 };
  }

  if (count > 0) {
    await logActivity({
      userId: access.userId,
      action: "tasks_bulk_updated",
      projectId,
      entityType: "task",
      details: { ...details, count, task_ids: ids },
    });
    revalidatePath(`/projects/${projectId}/work`);
  }
  return { error: null, count };
}
