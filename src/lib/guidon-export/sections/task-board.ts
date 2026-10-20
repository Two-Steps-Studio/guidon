import "server-only";

import { z } from "zod";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/work/task-board";
import type { GuidonSection } from "../types";
import type { IdRemapper } from "../id-remapper";

// Keys, not fixed lists: projects define their own columns and priorities
// (migration 060). Files from before that only ever hold the built-ins.
const WorkflowKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const TaskStatusEnum = WorkflowKey;
const TaskPriorityEnum = WorkflowKey;
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional();

const ColumnOverrideSchema = z.object({
  status: TaskStatusEnum,
  label: z.string().max(50).nullable(),
  sortOrder: z.number().int(),
  hidden: z.boolean(),
  isDone: z.boolean().optional(),
  color: HexColor,
});

const PrioritySchema = z.object({
  key: TaskPriorityEnum,
  label: z.string().max(50).nullable(),
  color: HexColor,
  rank: z.number().int(),
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
  columns: z.array(ColumnOverrideSchema).max(100).default([]),
  priorities: z.array(PrioritySchema).max(100).default([]),
  // Cap independent of any plan's task limit - insertTasksInDependencyOrder
  // inserts one row at a time inside a single withUser() connection (or one
  // request per row on the Supabase path), so an unbounded array is a
  // resource-exhaustion vector on its own before the plan-limit check in
  // import-actions.ts even runs.
  tasks: z.array(TaskSchema).max(5000, "A .guidon file can contain at most 5000 tasks.").default([]),
}).superRefine((board, ctx) => {
  // A task can only use a built-in status/priority or one the file defines
  // - checked here so a bad file gets a clear message instead of failing
  // halfway through the import on the database's own check.
  const statuses = new Set<string>([...TASK_STATUSES, ...board.columns.map((c) => c.status)]);
  const priorities = new Set<string>([...TASK_PRIORITIES, ...board.priorities.map((p) => p.key)]);
  const badStatus = board.tasks.find((task) => !statuses.has(task.status));
  if (badStatus) ctx.addIssue({ code: "custom", message: `Task "${badStatus.title}" uses status "${badStatus.status}", which the file doesn't define.` });
  const badPriority = board.tasks.find((task) => !priorities.has(task.priority));
  if (badPriority) ctx.addIssue({ code: "custom", message: `Task "${badPriority.title}" uses priority "${badPriority.priority}", which the file doesn't define.` });
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
  is_done: boolean;
  color: string | null;
}

interface PriorityRow {
  key: string;
  label: string | null;
  color: string | null;
  rank: number;
  hidden: boolean;
}

const toColumnExport = (row: ColumnRow): TaskBoardData["columns"][number] => ({
  status: row.status,
  label: row.label,
  sortOrder: row.sort_order,
  hidden: row.hidden,
  isDone: row.is_done,
  color: row.color,
});

const toPriorityExport = (row: PriorityRow): TaskBoardData["priorities"][number] => ({
  key: row.key,
  label: row.label,
  color: row.color,
  rank: row.rank,
  hidden: row.hidden,
});

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
      const [tasksResult, columnsResult, prioritiesResult] = await Promise.all([
        withUser(userId, ({ query }) =>
          query(
            `SELECT id, title, description, status, priority, tags, due_date, progress_percent,
                    estimated_hours, actual_hours, sort_order, parent_task_id, assignee_id
             FROM tasks WHERE project_id = $1`,
            [projectId]
          )
        ),
        withUser(userId, ({ query }) =>
          query(
            "SELECT status, label, sort_order, hidden, is_done, color FROM project_board_columns WHERE project_id = $1",
            [projectId]
          )
        ),
        withUser(userId, ({ query }) =>
          query("SELECT key, label, color, rank, hidden FROM project_task_priorities WHERE project_id = $1", [projectId])
        ),
      ]);

      return {
        columns: (columnsResult.rows as ColumnRow[]).map(toColumnExport),
        priorities: (prioritiesResult.rows as PriorityRow[]).map(toPriorityExport),
        tasks: (tasksResult.rows as TaskRow[]).map(toTaskExport),
      };
    }

    const supabase = await createClient();
    const [tasksResult, columnsResult, prioritiesResult] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, description, status, priority, tags, due_date, progress_percent, estimated_hours, actual_hours, sort_order, parent_task_id, assignee_id"
        )
        .eq("project_id", projectId),
      supabase
        .from("project_board_columns")
        .select("status, label, sort_order, hidden, is_done, color")
        .eq("project_id", projectId),
      supabase.from("project_task_priorities").select("key, label, color, rank, hidden").eq("project_id", projectId),
    ]);

    return {
      columns: ((columnsResult.data ?? []) as ColumnRow[]).map(toColumnExport),
      priorities: ((prioritiesResult.data ?? []) as PriorityRow[]).map(toPriorityExport),
      tasks: ((tasksResult.data ?? []) as TaskRow[]).map(toTaskExport),
    };
  },

  async importData(projectId, userId, data, idMap) {
    if (hasDirectDatabase()) {
      await withUser(userId, async ({ query }) => {
        await query("DELETE FROM tasks WHERE project_id = $1", [projectId]);
        // The file's columns and priorities replace the project's, and go in
        // before the tasks: a task's status/priority must exist in the
        // project (validate_task_workflow, 060). Deletable now that 060
        // granted DELETE; with the tasks gone nothing is in use.
        await query("DELETE FROM project_board_columns WHERE project_id = $1", [projectId]);
        await query("DELETE FROM project_task_priorities WHERE project_id = $1", [projectId]);
        for (const column of data.columns) {
          await query(
            `INSERT INTO project_board_columns (project_id, status, label, sort_order, hidden, is_done, color, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
            [projectId, column.status, column.label, column.sortOrder, column.hidden, column.isDone ?? false, column.color ?? null]
          );
        }
        for (const priority of data.priorities) {
          await query(
            `INSERT INTO project_task_priorities (project_id, key, label, color, rank, hidden)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [projectId, priority.key, priority.label, priority.color ?? null, priority.rank, priority.hidden]
          );
        }

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

    const { data: oldPriorities, error: oldPrioritiesError } = await supabase
      .from("project_task_priorities")
      .select("key")
      .eq("project_id", projectId);
    if (oldPrioritiesError) throw new Error(`Failed to read existing priorities: ${oldPrioritiesError.message}`);

    // See the matching comment in the direct-Postgres branch above: an
    // exported assignee only carries over if that person is a member of
    // the target project.
    const { data: members, error: membersError } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId);
    if (membersError) throw new Error(`Failed to read project members: ${membersError.message}`);
    const memberIds = new Set((members ?? []).map((m) => m.user_id));

    // Columns and priorities first: a task's status/priority must exist in
    // the project before the task goes in (validate_task_workflow, 060).
    if (data.columns.length > 0) {
      const { error } = await supabase.from("project_board_columns").upsert(
        data.columns.map((column) => ({
          project_id: projectId,
          status: column.status,
          label: column.label,
          sort_order: column.sortOrder,
          hidden: column.hidden,
          is_done: column.isDone ?? false,
          color: column.color ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "project_id,status" }
      );
      if (error) throw new Error(`Failed to import board columns: ${error.message}`);
    }
    if (data.priorities.length > 0) {
      const { error } = await supabase.from("project_task_priorities").upsert(
        data.priorities.map((priority) => ({
          project_id: projectId,
          key: priority.key,
          label: priority.label,
          color: priority.color ?? null,
          rank: priority.rank,
          hidden: priority.hidden,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "project_id,key" }
      );
      if (error) throw new Error(`Failed to import priorities: ${error.message}`);
    }

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

    // Only now remove what the new data didn't replace - old tasks (fresh
    // ids mean no collision with what was just inserted).
    if (oldTasks && oldTasks.length > 0) {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .in("id", oldTasks.map((t) => t.id));
      if (error) throw new Error(`Failed to remove replaced tasks: ${error.message}`);
    }

    // Then the old columns and priorities the file doesn't have - after the
    // old tasks, so none of them is still in use.
    const newStatuses = new Set(data.columns.map((c) => c.status));
    const staleStatuses = (oldColumns ?? []).map((c) => c.status).filter((status) => !newStatuses.has(status));
    if (staleStatuses.length > 0) {
      const { error } = await supabase
        .from("project_board_columns")
        .delete()
        .eq("project_id", projectId)
        .in("status", staleStatuses);
      if (error) throw new Error(`Failed to remove stale board columns: ${error.message}`);
    }
    const newPriorities = new Set(data.priorities.map((p) => p.key));
    const stalePriorities = (oldPriorities ?? []).map((p) => p.key).filter((key) => !newPriorities.has(key));
    if (stalePriorities.length > 0) {
      const { error } = await supabase
        .from("project_task_priorities")
        .delete()
        .eq("project_id", projectId)
        .in("key", stalePriorities);
      if (error) throw new Error(`Failed to remove stale priorities: ${error.message}`);
    }
  },
};
