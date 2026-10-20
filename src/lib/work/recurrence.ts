import "server-only";

import { after } from "next/server";
import { serviceDataClient, type DataClient } from "@/lib/data-client";
import { hostedTaskLimitError } from "@/lib/limits";
import { isRecurrenceRule, nextDueDate, resetChecklist } from "@/lib/work/recurrence-core";
import type { Task } from "@/types/task";

/**
 * Recurring tasks (migration 063): when a repeating task is finished, its
 * next occurrence is created - same title, description (checklist unticked),
 * priority, labels, assignee, estimate and subtasks (all open again), due on
 * the next date of the rule, in To do. No cron: this runs on completion.
 *
 * Called twice on purpose and safe to: synchronously by the board's own
 * actions (so the new card shows up right away) and from emitTaskEvent's
 * "completed" for every other path (bulk, API, MCP, Discord, agents). The
 * unique index on recurred_from makes the second call a no-op, as it does
 * for finish -> reopen -> finish again.
 *
 * Returns the created rows (task first, then its subtasks), or [] when there
 * was nothing to do.
 */
export async function ensureNextOccurrence(db: DataClient, projectId: string, userId: string, taskId: string): Promise<Task[]> {
  const { data: task } = await db.from<Task>("tasks").select("*").eq("id", taskId).eq("project_id", projectId).maybeSingle();
  if (!task || task.parent_task_id || !task.is_done) return [];
  const rule = task.recurrence_rule;
  const interval = task.recurrence_interval;
  if (!isRecurrenceRule(rule) || !interval) return [];

  const { data: existing } = await db.from<{ id: string }>("tasks").select("id").eq("recurred_from", taskId).limit(1);
  if (existing.length) return [];

  const [{ data: project }, { data: subtasks }, { data: todoColumn }] = await Promise.all([
    db.from<{ organization_id: string }>("projects").select("organization_id").eq("id", projectId).maybeSingle(),
    db.from<Task>("tasks").select("*").eq("parent_task_id", taskId).eq("project_id", projectId).order("sort_order", { ascending: true }),
    db.from<{ hidden: boolean }>("project_board_columns").select("hidden").eq("project_id", projectId).eq("status", "todo").maybeSingle(),
  ]);
  if (!project) return [];
  // Guidon Cloud's per-project task cap applies like to any other new task.
  if (await hostedTaskLimitError(projectId, project.organization_id)) return [];

  const status = todoColumn?.hidden ? "backlog" : "todo";
  const { data: next, error } = await db
    .from<Task>("tasks")
    .insert({
      project_id: projectId,
      title: task.title,
      description: resetChecklist(task.description),
      status,
      priority: task.priority,
      tags: task.tags ?? [],
      assignee_id: task.assignee_id,
      estimated_hours: task.estimated_hours,
      decision_id: task.decision_id,
      due_date: nextDueDate(task.due_date, rule, interval).toISOString(),
      recurrence_rule: rule,
      recurrence_interval: interval,
      recurred_from: task.id,
      created_by: userId,
    })
    .select("*")
    .single();
  // 23505: another call created it first.
  if (error || !next) return [];

  const created: Task[] = [next];
  for (const subtask of subtasks) {
    const { data: copy } = await db
      .from<Task>("tasks")
      .insert({
        project_id: projectId,
        parent_task_id: next.id,
        title: subtask.title,
        description: resetChecklist(subtask.description),
        status,
        priority: subtask.priority,
        tags: subtask.tags ?? [],
        assignee_id: subtask.assignee_id,
        estimated_hours: subtask.estimated_hours,
        sort_order: subtask.sort_order,
        created_by: userId,
      })
      .select("*")
      .single();
    if (copy) created.push(copy);
  }
  return created;
}

/**
 * The background half (emitTaskEvent's "completed"): every way of finishing
 * a task - bulk, /api/v1, MCP, Discord, agents - gets its next occurrence.
 * Service client because it runs after the response, where not every mode
 * still has the caller's RLS session; it only ever copies the one task the
 * caller just finished, within its project. Never throws.
 */
export function scheduleNextOccurrence(projectId: string, userId: string, taskId: string): void {
  after(async () => {
    try {
      await ensureNextOccurrence(serviceDataClient(), projectId, userId, taskId);
    } catch (error) {
      console.error("[recurrence] next occurrence skipped:", error instanceof Error ? error.message : error);
    }
  });
}
