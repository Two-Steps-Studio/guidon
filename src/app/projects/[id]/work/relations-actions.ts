"use server";

import { isValidUuid } from "@/lib/api/validate-id";
import { getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import type { Task } from "@/types/task";

export type RelatedTask = {
  relationId: string;
  id: string;
  title: string;
  status: string;
};

const RELATION_TYPE = "related_to";

type RelationRow = {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
};

type TaskRow = { id: string; title: string; status: string };

export async function loadTaskRelatedTasks(
  projectId: string,
  taskId: string
): Promise<{ relations: RelatedTask[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { relations: [], error: "You do not have access to this project." };

  if (!isValidUuid(taskId)) return { relations: [], error: "Invalid task id." };

  let relationRows: RelationRow[];

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `SELECT id, source_type, source_id, target_type, target_id
           FROM context_relations
           WHERE relation_type = $1
             AND ((source_type = 'task' AND source_id = $2) OR (target_type = 'task' AND target_id = $2))`,
          [RELATION_TYPE, taskId]
        )
      );
      relationRows = result.rows;
    } catch (error) {
      return { relations: [], error: error instanceof Error ? error.message : "Failed to load related tasks." };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("context_relations")
      .select("id, source_type, source_id, target_type, target_id")
      .eq("relation_type", RELATION_TYPE)
      .or(`and(source_type.eq.task,source_id.eq.${taskId}),and(target_type.eq.task,target_id.eq.${taskId})`);

    if (error) return { relations: [], error: error.message };
    relationRows = (data ?? []) as RelationRow[];
  }

  if (relationRows.length === 0) return { relations: [], error: null };

  const otherTaskIds = relationRows.map((row) =>
    row.source_type === "task" && row.source_id === taskId ? row.target_id : row.source_id
  );

  let taskRows: TaskRow[];

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(`SELECT id, title, status FROM tasks WHERE id = ANY($1::uuid[])`, [otherTaskIds])
      );
      taskRows = result.rows;
    } catch (error) {
      return { relations: [], error: error instanceof Error ? error.message : "Failed to load related tasks." };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from("tasks").select("id, title, status").in("id", otherTaskIds);
    if (error) return { relations: [], error: error.message };
    taskRows = (data ?? []) as TaskRow[];
  }

  const taskById = new Map(taskRows.map((t) => [t.id, t]));

  const relations: RelatedTask[] = [];
  for (let i = 0; i < relationRows.length; i++) {
    const row = relationRows[i];
    const otherTask = taskById.get(otherTaskIds[i]);
    if (otherTask) {
      relations.push({ relationId: row.id, id: otherTask.id, title: otherTask.title, status: otherTask.status });
    }
  }

  return { relations, error: null };
}

export async function searchProjectTasksByTitle(
  projectId: string,
  query: string,
  excludeIds: string[]
): Promise<{ tasks: { id: string; title: string }[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { tasks: [], error: "You do not have access to this project." };

  if (excludeIds.some((id) => !isValidUuid(id))) {
    return { tasks: [], error: "Invalid task id in exclusion list." };
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) return { tasks: [], error: null };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query: runQuery }) =>
        runQuery(
          `SELECT id, title FROM tasks
           WHERE project_id = $1 AND title ILIKE $2 AND NOT (id = ANY($3::uuid[]))
           ORDER BY title
           LIMIT 20`,
          [projectId, `%${trimmed}%`, excludeIds.length > 0 ? excludeIds : ["00000000-0000-0000-0000-000000000000"]]
        )
      );
      return { tasks: result.rows, error: null };
    } catch (error) {
      return { tasks: [], error: error instanceof Error ? error.message : "Search failed." };
    }
  }

  const supabase = await createClient();
  let builder = supabase
    .from("tasks")
    .select("id, title")
    .eq("project_id", projectId)
    .ilike("title", `%${trimmed}%`)
    .order("title")
    .limit(20);

  if (excludeIds.length > 0) {
    builder = builder.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await builder;
  if (error) return { tasks: [], error: error.message };
  return { tasks: (data ?? []) as { id: string; title: string }[], error: null };
}

/**
 * Fetches a single task by id, scoped to this project. Used as a fallback
 * when a related-task navigation click targets a task that isn't already in
 * the caller's local state - e.g. the calendar view only holds tasks whose
 * due_date falls in the currently viewed month, so a related task with no
 * due date (or one outside that month) needs to be fetched on demand rather
 * than silently failing to open.
 */
export async function loadTaskById(
  projectId: string,
  taskId: string
): Promise<{ task: Task | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { task: null, error: "You do not have access to this project." };
  if (!isValidUuid(taskId)) return { task: null, error: "Invalid task id." };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(`SELECT * FROM tasks WHERE id = $1 AND project_id = $2`, [taskId, projectId])
      );
      return { task: (result.rows[0] as Task) ?? null, error: null };
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : "Failed to load task." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return { task: null, error: error.message };
  return { task: (data as Task) ?? null, error: null };
}
