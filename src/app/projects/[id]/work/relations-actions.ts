"use server";

import { isValidUuid } from "@/lib/api/validate-id";
import { getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
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

  // A task can be on either end of a related_to relation - two indexed
  // lookups instead of one OR across both column pairs.
  const db = dataClient(access.userId);
  const COLUMNS = "id, source_type, source_id, target_type, target_id";
  const [asSource, asTarget] = await Promise.all([
    db
      .from<RelationRow>("context_relations")
      .select(COLUMNS)
      .eq("relation_type", RELATION_TYPE)
      .eq("source_type", "task")
      .eq("source_id", taskId),
    db
      .from<RelationRow>("context_relations")
      .select(COLUMNS)
      .eq("relation_type", RELATION_TYPE)
      .eq("target_type", "task")
      .eq("target_id", taskId),
  ]);
  const relationError = asSource.error ?? asTarget.error;
  if (relationError) return { relations: [], error: relationError.message };
  // A self-relation would appear in both results.
  const relationRows = Array.from(new Map([...asSource.data, ...asTarget.data].map((row) => [row.id, row])).values());

  if (relationRows.length === 0) return { relations: [], error: null };

  const otherTaskIds = relationRows.map((row) =>
    row.source_type === "task" && row.source_id === taskId ? row.target_id : row.source_id
  );

  const { data: taskRows, error: taskError } = await db
    .from<TaskRow>("tasks")
    .select("id, title, status")
    .in("id", otherTaskIds);
  if (taskError) return { relations: [], error: taskError.message };

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

  // Over-fetch by the number of exclusions and drop them here, so the
  // result still holds up to 20 matches without a NOT IN filter.
  const { data, error } = await dataClient(access.userId)
    .from<{ id: string; title: string }>("tasks")
    .select("id, title")
    .eq("project_id", projectId)
    .ilike("title", `%${trimmed}%`)
    .order("title")
    .limit(20 + excludeIds.length);

  if (error) return { tasks: [], error: error.message };
  const excluded = new Set(excludeIds);
  return { tasks: data.filter((task) => !excluded.has(task.id)).slice(0, 20), error: null };
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

  const { data, error } = await dataClient(access.userId)
    .from<Task>("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return { task: null, error: error.message };
  return { task: data, error: null };
}
