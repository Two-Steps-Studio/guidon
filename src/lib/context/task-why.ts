"use server";

/**
 * "Why" context for a single task — TODO.md §20 ("a record should be able to
 * answer: where did this information come from?") applied to the task detail
 * dialog specifically.
 *
 * Two things are surfaced:
 *   1. The task's directly-linked decision, via tasks.decision_id.
 *   2. Everything connected through context_relations where the task is
 *      either the source or the target — grouped by relation_type in the UI,
 *      resolved here against whichever table source_type/target_type points
 *      at (context_decisions / context_sources / project_memory /
 *      roadmap_phases / project_files / tasks / projects).
 *
 * Called lazily as a Server Action from TaskDetailDialog when the dialog
 * opens (src/components/work/task-detail-dialog.tsx), the same pattern
 * loadComments already uses (src/app/projects/[id]/work/actions.ts) — not
 * prefetched for every task on the board, since most tasks are never opened.
 *
 * Attribution: creator ids returned here (createdBy) are resolved against
 * `members` on the client, exactly like comment authors already are
 * (TaskDetailDialog's `membersById`) — every entity a project member could
 * have created satisfies project_role(project_id) on insert, so the
 * project's member list is a complete lookup table. context_sources.author
 * is a free-text field with no profile FK (see types/context.ts), so it is
 * returned separately as createdByText rather than an id to resolve.
 */

import { createClient } from "@/lib/supabase-server";
import { getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser, type DbSession } from "@/lib/db/session";
import type { ContextEntityType, ContextRelation, RelationType } from "@/types/context";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface TaskWhyDecision {
  id: string;
  title: string;
  status: string;
  decision_type: string;
  description: string | null;
}

export interface TaskWhyRelatedItem {
  relationId: string;
  relationType: RelationType;
  /** "outgoing" when the task is the relation's source, "incoming" when the task is the target. */
  direction: "outgoing" | "incoming";
  entityType: ContextEntityType;
  entityId: string;
  /** True when the other-side row no longer resolves (deleted, or an orphaned relation — see migration 011's comment block). */
  missing: boolean;
  title: string;
  preview: string | null;
  /** Set only for entityType === "decision". */
  status: string | null;
  createdBy: string | null;
  createdByText: string | null;
  createdAt: string | null;
}

export interface TaskWhyContext {
  decision: TaskWhyDecision | null;
  related: TaskWhyRelatedItem[];
  error: string | null;
}

const EMPTY_ERROR = (error: string): TaskWhyContext => ({ decision: null, related: [], error });

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

async function fetchMap(
  supabase: SupabaseServerClient,
  table: string,
  columns: string,
  ids: Set<string> | undefined
): Promise<Map<string, Record<string, unknown>>> {
  if (!ids || ids.size === 0) return new Map();

  const { data } = await supabase.from(table).select(columns).in("id", Array.from(ids));
  const map = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    map.set(row.id as string, row);
  }
  return map;
}

/**
 * Same as fetchMap, against a pg session instead of the Supabase client.
 * `table`/`columns` are always call-site string literals here, never
 * request input, same trust boundary as every other raw-SQL query built in
 * this codebase's self-hosted branches.
 */
async function fetchMapLocal(
  query: DbSession["query"],
  table: string,
  columns: string,
  ids: Set<string> | undefined
): Promise<Map<string, Record<string, unknown>>> {
  if (!ids || ids.size === 0) return new Map();

  const result = await query(`SELECT ${columns} FROM ${table} WHERE id = ANY($1::uuid[])`, [
    Array.from(ids),
  ]);
  const map = new Map<string, Record<string, unknown>>();
  for (const row of result.rows as Record<string, unknown>[]) {
    map.set(row.id as string, row);
  }
  return map;
}

function titleFor(type: ContextEntityType, row: Record<string, unknown> | undefined): string {
  if (!row) return "(deleted)";
  switch (type) {
    case "decision":
      return String(row.title ?? "Untitled decision");
    case "source":
      return String(row.title ?? "Untitled source");
    case "memory":
      return truncate(String(row.content ?? ""), 60) || "Untitled memory";
    case "phase":
      return String(row.name ?? "Untitled phase");
    case "file":
      return String(row.name ?? "Untitled file");
    case "task":
      return String(row.title ?? "Untitled task");
    case "project":
      return String(row.name ?? "Untitled project");
    default:
      return "Unknown";
  }
}

function previewFor(type: ContextEntityType, row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  switch (type) {
    case "source":
      return row.content ? truncate(String(row.content), 140) : null;
    case "phase":
      return row.description ? truncate(String(row.description), 140) : null;
    case "decision":
      return row.description ? truncate(String(row.description), 140) : null;
    default:
      return null;
  }
}

function creatorIdFor(type: ContextEntityType, row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  switch (type) {
    case "decision":
      return (row.made_by as string | null) ?? null;
    case "memory":
    case "phase":
    case "task":
    case "project":
      return (row.created_by as string | null) ?? null;
    case "file":
      return (row.uploaded_by as string | null) ?? null;
    case "source":
      // context_sources has no profile FK for authorship — see createdByText.
      return null;
    default:
      return null;
  }
}

function createdAtFor(type: ContextEntityType, row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  if (type === "decision") return (row.made_at as string | null) ?? null;
  return (row.created_at as string | null) ?? null;
}

export async function getTaskWhyContext(projectId: string, taskId: string): Promise<TaskWhyContext> {
  const access = await getProjectAccess(projectId);
  if (!access) return EMPTY_ERROR("You do not have access to this project.");

  let decisionId: string | null;
  let relations: ContextRelation[];
  let decision: TaskWhyDecision | null = null;

  if (hasDirectDatabase()) {
    try {
      [decisionId, relations, decision] = await withUser(access.userId, async ({ query }) => {
        const [taskRes, relationsRes] = await Promise.all([
          query("SELECT decision_id FROM tasks WHERE id = $1", [taskId]),
          query(
            `SELECT * FROM context_relations
             WHERE project_id = $1
               AND ((source_type = 'task' AND source_id = $2) OR (target_type = 'task' AND target_id = $2))
             ORDER BY created_at DESC`,
            [projectId, taskId]
          ),
        ]);

        const id = (taskRes.rows[0]?.decision_id as string | null) ?? null;
        let dec: TaskWhyDecision | null = null;
        if (id) {
          const decisionRes = await query(
            "SELECT id, title, status, decision_type, description FROM context_decisions WHERE id = $1",
            [id]
          );
          if (decisionRes.rows.length > 0) dec = decisionRes.rows[0] as TaskWhyDecision;
        }

        return [id, relationsRes.rows, dec] as const;
      });
    } catch (error) {
      return EMPTY_ERROR(error instanceof Error ? error.message : "Failed to load context.");
    }
  } else {
    const supabase = await createClient();

    const [taskRes, relationsRes] = await Promise.all([
      supabase.from("tasks").select("decision_id").eq("id", taskId).maybeSingle(),
      supabase
        .from("context_relations")
        .select("*")
        .eq("project_id", projectId)
        .or(
          `and(source_type.eq.task,source_id.eq.${taskId}),and(target_type.eq.task,target_id.eq.${taskId})`
        )
        .order("created_at", { ascending: false }),
    ]);

    if (taskRes.error) return EMPTY_ERROR(taskRes.error.message);
    if (relationsRes.error) return EMPTY_ERROR(relationsRes.error.message);

    decisionId = (taskRes.data as { decision_id: string | null } | null)?.decision_id ?? null;
    if (decisionId) {
      const { data } = await supabase
        .from("context_decisions")
        .select("id, title, status, decision_type, description")
        .eq("id", decisionId)
        .maybeSingle();
      if (data) decision = data as TaskWhyDecision;
    }

    relations = (relationsRes.data ?? []) as ContextRelation[];
  }

  const otherSide = (
    relation: ContextRelation
  ): { type: ContextEntityType; id: string; direction: "outgoing" | "incoming" } => {
    const taskIsSource = relation.source_type === "task" && relation.source_id === taskId;
    return taskIsSource
      ? { type: relation.target_type, id: relation.target_id, direction: "outgoing" }
      : { type: relation.source_type, id: relation.source_id, direction: "incoming" };
  };

  const idsByType: Partial<Record<ContextEntityType, Set<string>>> = {};
  for (const relation of relations) {
    const { type, id } = otherSide(relation);
    (idsByType[type] ??= new Set()).add(id);
  }

  let decisionsMap: Map<string, Record<string, unknown>>;
  let sourcesMap: Map<string, Record<string, unknown>>;
  let memoryMap: Map<string, Record<string, unknown>>;
  let phasesMap: Map<string, Record<string, unknown>>;
  let filesMap: Map<string, Record<string, unknown>>;
  let tasksMap: Map<string, Record<string, unknown>>;
  let projectsMap: Map<string, Record<string, unknown>>;

  if (hasDirectDatabase()) {
    [decisionsMap, sourcesMap, memoryMap, phasesMap, filesMap, tasksMap, projectsMap] = await withUser(
      access.userId,
      ({ query }) =>
        Promise.all([
          fetchMapLocal(
            query,
            "context_decisions",
            "id, title, status, description, made_by, made_at",
            idsByType.decision
          ),
          fetchMapLocal(query, "context_sources", "id, title, content, author, created_at", idsByType.source),
          fetchMapLocal(
            query,
            "project_memory",
            "id, content, memory_type, created_by, created_at",
            idsByType.memory
          ),
          fetchMapLocal(
            query,
            "roadmap_phases",
            "id, name, description, created_by, created_at",
            idsByType.phase
          ),
          fetchMapLocal(query, "project_files", "id, name, uploaded_by, created_at", idsByType.file),
          fetchMapLocal(query, "tasks", "id, title, created_by, created_at", idsByType.task),
          fetchMapLocal(query, "projects", "id, name, created_by, created_at", idsByType.project),
        ])
    );
  } else {
    const supabase = await createClient();

    [decisionsMap, sourcesMap, memoryMap, phasesMap, filesMap, tasksMap, projectsMap] = await Promise.all([
      fetchMap(supabase, "context_decisions", "id, title, status, description, made_by, made_at", idsByType.decision),
      fetchMap(supabase, "context_sources", "id, title, content, author, created_at", idsByType.source),
      fetchMap(supabase, "project_memory", "id, content, memory_type, created_by, created_at", idsByType.memory),
      fetchMap(supabase, "roadmap_phases", "id, name, description, created_by, created_at", idsByType.phase),
      fetchMap(supabase, "project_files", "id, name, uploaded_by, created_at", idsByType.file),
      fetchMap(supabase, "tasks", "id, title, created_by, created_at", idsByType.task),
      fetchMap(supabase, "projects", "id, name, created_by, created_at", idsByType.project),
    ]);
  }

  const mapsByType: Partial<Record<ContextEntityType, Map<string, Record<string, unknown>>>> = {
    decision: decisionsMap,
    source: sourcesMap,
    memory: memoryMap,
    phase: phasesMap,
    file: filesMap,
    task: tasksMap,
    project: projectsMap,
  };

  const related: TaskWhyRelatedItem[] = relations.map((relation) => {
    const { type, id, direction } = otherSide(relation);
    const row = mapsByType[type]?.get(id);

    return {
      relationId: relation.id,
      relationType: relation.relation_type,
      direction,
      entityType: type,
      entityId: id,
      missing: !row,
      title: titleFor(type, row),
      preview: previewFor(type, row),
      status: type === "decision" ? ((row?.status as string | undefined) ?? null) : null,
      createdBy: creatorIdFor(type, row),
      createdByText: type === "source" ? ((row?.author as string | undefined) ?? null) : null,
      createdAt: createdAtFor(type, row),
    };
  });

  return { decision, related, error: null };
}
