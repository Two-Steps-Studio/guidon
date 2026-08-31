import "server-only";

import { z } from "zod";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import type { GuidonSection } from "../types";
import type { IdRemapper } from "../id-remapper";

const TaskStatusEnum = z.enum(["backlog", "todo", "in_progress", "ai_working", "review", "done"]);
const TaskPriorityEnum = z.enum(["low", "medium", "high", "critical"]);

const ColumnOverrideSchema = z.object({
  status: TaskStatusEnum,
  label: z.string().nullable(),
  sortOrder: z.number().int(),
  hidden: z.boolean(),
});

const TaskSchema = z.object({
  localId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: TaskStatusEnum,
  priority: TaskPriorityEnum,
  tags: z.array(z.string()).optional(),
  dueDate: z.string().nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  actualHours: z.number().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  parentTaskLocalId: z.string().nullable().optional(),
  // .optional() as well as .nullable() so a .guidon file exported before
  // this field existed still validates - it just imports unassigned.
  assigneeId: z.string().uuid().nullable().optional(),
});

const TaskBoardSchema = z.object({
  columns: z.array(ColumnOverrideSchema).default([]),
  tasks: z.array(TaskSchema).default([]),
});

export type TaskBoardData = z.infer<typeof TaskBoardSchema>;

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[] | null;
  due_date: string | null;
  progress_percent: number | null;
  estimated_hours: number | string | null;
  actual_hours: number | string | null;
  sort_order: number | null;
  parent_task_id: string | null;
  assignee_id: string | null;
}

interface ColumnRow {
  status: string;
  label: string | null;
  sort_order: number;
  hidden: boolean;
}

function toTaskExport(row: TaskRow): TaskBoardData["tasks"][number] {
  return {
    localId: row.id,
    title: row.title,
    description: row.description,
    status: row.status as z.infer<typeof TaskStatusEnum>,
    priority: row.priority as z.infer<typeof TaskPriorityEnum>,
    tags: row.tags ?? [],
    dueDate: row.due_date,
    progressPercent: row.progress_percent,
    estimatedHours: row.estimated_hours === null ? null : Number(row.estimated_hours),
    actualHours: row.actual_hours === null ? null : Number(row.actual_hours),
    sortOrder: row.sort_order,
    parentTaskLocalId: row.parent_task_id,
    assigneeId: row.assignee_id,
  };
}

/**
 * Inserts tasks in an order that resolves `parentTaskLocalId` via `idMap`
 * before the child needs it - a multi-pass loop rather than a proper
 * topological sort since task lists here are small and parent chains are
 * shallow. A task whose declared parent never resolves (dangling/foreign
 * reference, or a cycle) is inserted with no parent rather than failing the
 * whole import - the DB's own `parent_task_id IS DISTINCT FROM id` check is
 * the only structural guarantee this data ever had anyway.
 */
async function insertTasksInDependencyOrder(
  tasks: TaskBoardData["tasks"],
  insertOne: (task: TaskBoardData["tasks"][number], parentId: string | null) => Promise<string>,
  idMap: IdRemapper
): Promise<void> {
  const remaining = new Set(tasks);

  while (remaining.size > 0) {
    let progressed = false;

    for (const task of remaining) {
      const parentId = task.parentTaskLocalId ? idMap.resolve(task.parentTaskLocalId) : null;
      const parentPending = task.parentTaskLocalId !== null && task.parentTaskLocalId !== undefined && parentId === null;
      const parentStillInFile = parentPending && tasks.some((t) => t.localId === task.parentTaskLocalId);

      if (parentStillInFile) continue; // wait for the parent to be inserted first

      const newId = await insertOne(task, parentId);
      idMap.register(task.localId, newId);
      remaining.delete(task);
      progressed = true;
    }

    if (!progressed) {
      // Cycle or otherwise unresolvable - insert the rest with no parent.
      for (const task of remaining) {
        const newId = await insertOne(task, null);
        idMap.register(task.localId, newId);
      }
      break;
    }
  }
}

export const taskBoardSection: GuidonSection<TaskBoardData> = {
  key: "taskBoard",
  schema: TaskBoardSchema,

  async exportData(projectId, userId) {
    if (hasDirectDatabase()) {
      const [tasksResult, columnsResult] = await Promise.all([
        withUser(userId, ({ query }) =>
          query(
            `SELECT id, title, description, status, priority, tags, due_date, progress_percent,
                    estimated_hours, actual_hours, sort_order, parent_task_id, assignee_id
             FROM tasks WHERE project_id = $1`,
            [projectId]
          )
        ),
        withUser(userId, ({ query }) =>
          query("SELECT status, label, sort_order, hidden FROM project_board_columns WHERE project_id = $1", [
            projectId,
          ])
        ),
      ]);

      return {
        columns: (columnsResult.rows as ColumnRow[]).map((row) => ({
          status: row.status as z.infer<typeof TaskStatusEnum>,
          label: row.label,
          sortOrder: row.sort_order,
          hidden: row.hidden,
        })),
        tasks: (tasksResult.rows as TaskRow[]).map(toTaskExport),
      };
    }

    const supabase = await createClient();
    const [tasksResult, columnsResult] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, description, status, priority, tags, due_date, progress_percent, estimated_hours, actual_hours, sort_order, parent_task_id, assignee_id"
        )
        .eq("project_id", projectId),
      supabase
        .from("project_board_columns")
        .select("status, label, sort_order, hidden")
        .eq("project_id", projectId),
    ]);

    return {
      columns: ((columnsResult.data ?? []) as ColumnRow[]).map((row) => ({
        status: row.status as z.infer<typeof TaskStatusEnum>,
        label: row.label,
        sortOrder: row.sort_order,
        hidden: row.hidden,
      })),
      tasks: ((tasksResult.data ?? []) as TaskRow[]).map(toTaskExport),
    };
  },

  async importData(projectId, userId, data, idMap) {
    if (hasDirectDatabase()) {
      await withUser(userId, async ({ query }) => {
        await query("DELETE FROM tasks WHERE project_id = $1", [projectId]);
        await query("DELETE FROM project_board_columns WHERE project_id = $1", [projectId]);

        // A task's exported assignee only makes sense if that same person is
        // a member of the TARGET project - "new" mode can land in a
        // different organization entirely, and "overwrite" can land in a
        // project with a different roster. The DB itself would reject the
        // whole task (tasks_assignee_id_fkey's validation trigger, 001) if
        // this were passed through unchecked, so this resolves it down to
        // null instead of letting one stale assignee fail the whole import.
        const membersResult = await query("SELECT user_id FROM project_members WHERE project_id = $1", [
          projectId,
        ]);
        const memberIds = new Set(membersResult.rows.map((row: { user_id: string }) => row.user_id));

        await insertTasksInDependencyOrder(
          data.tasks,
          async (task, parentId) => {
            const assigneeId = task.assigneeId && memberIds.has(task.assigneeId) ? task.assigneeId : null;
            const result = await query(
              `INSERT INTO tasks
                 (project_id, parent_task_id, title, description, status, priority, tags, due_date,
                  progress_percent, estimated_hours, actual_hours, sort_order, assignee_id, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
               RETURNING id`,
              [
                projectId,
                parentId,
                task.title,
                task.description ?? null,
                task.status,
                task.priority,
                task.tags ?? [],
                task.dueDate ?? null,
                task.progressPercent ?? 0,
                task.estimatedHours ?? null,
                task.actualHours ?? null,
                task.sortOrder ?? null,
                assigneeId,
                userId,
              ]
            );
            return result.rows[0].id as string;
          },
          idMap
        );

        for (const column of data.columns) {
          await query(
            `INSERT INTO project_board_columns (project_id, status, label, sort_order, hidden, updated_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (project_id, status) DO UPDATE SET
               label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, hidden = EXCLUDED.hidden, updated_at = now()`,
            [projectId, column.status, column.label, column.sortOrder, column.hidden]
          );
        }
      });
      return;
    }

    // Unlike the direct-Postgres branch above, Supabase has no client-side
    // transaction across these statements - each commits the instant it
    // runs. Deleting first (as this used to do) meant a failure partway
    // through the inserts left the project with the old board gone AND the
    // new one incomplete. Inserting first and only deleting the old rows
    // once every new one has landed means the worst case on failure is
    // "old board still intact, orphaned partial new rows" instead of total
    // loss - not a real transaction, but it never destroys data it hasn't
    // successfully replaced yet.
    const supabase = await createClient();

    const { data: oldTasks, error: oldTasksError } = await supabase
      .from("tasks")
      .select("id")
      .eq("project_id", projectId);
    if (oldTasksError) throw new Error(`Failed to read existing tasks: ${oldTasksError.message}`);

    const { data: oldColumns, error: oldColumnsError } = await supabase
      .from("project_board_columns")
      .select("status")
      .eq("project_id", projectId);
    if (oldColumnsError) throw new Error(`Failed to read existing board columns: ${oldColumnsError.message}`);

    // See the matching comment in the direct-Postgres branch above: an
    // exported assignee only carries over if that person is a member of
    // the target project.
    const { data: members, error: membersError } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    if (membersError) throw new Error(`Failed to read project members: ${membersError.message}`);
    const memberIds = new Set((members ?? []).map((m) => m.user_id));

    await insertTasksInDependencyOrder(
      data.tasks,
      async (task, parentId) => {
        const assigneeId = task.assigneeId && memberIds.has(task.assigneeId) ? task.assigneeId : null;
        const { data: created, error } = await supabase
          .from("tasks")
          .insert({
            project_id: projectId,
            parent_task_id: parentId,
            title: task.title,
            description: task.description ?? null,
            status: task.status,
            priority: task.priority,
            tags: task.tags ?? [],
            due_date: task.dueDate ?? null,
            progress_percent: task.progressPercent ?? 0,
            estimated_hours: task.estimatedHours ?? null,
            actual_hours: task.actualHours ?? null,
            sort_order: task.sortOrder ?? null,
            assignee_id: assigneeId,
            created_by: userId,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Failed to import task "${task.title}": ${error.message}`);
        return created.id as string;
      },
      idMap
    );

    if (data.columns.length > 0) {
      const { error } = await supabase.from("project_board_columns").upsert(
        data.columns.map((column) => ({
          project_id: projectId,
          status: column.status,
          label: column.label,
          sort_order: column.sortOrder,
          hidden: column.hidden,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "project_id,status" }
      );
      if (error) throw new Error(`Failed to import board columns: ${error.message}`);
    }

    // Only now remove what the new data didn't replace - old tasks (fresh
    // ids mean no collision with what was just inserted) and any column
    // override for a status this import doesn't mention.
    if (oldTasks && oldTasks.length > 0) {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .in("id", oldTasks.map((t) => t.id));
      if (error) throw new Error(`Failed to remove replaced tasks: ${error.message}`);
    }

    const newStatuses = new Set(data.columns.map((c) => c.status));
    const staleStatuses = (oldColumns ?? []).map((c) => c.status).filter((s) => !newStatuses.has(s));
    if (staleStatuses.length > 0) {
      const { error } = await supabase
        .from("project_board_columns")
        .delete()
        .eq("project_id", projectId)
        .in("status", staleStatuses);
      if (error) throw new Error(`Failed to remove stale board columns: ${error.message}`);
    }
  },
};
