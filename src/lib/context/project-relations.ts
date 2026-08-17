/**
 * Scoping helpers for context_relations.
 *
 * public.context_relations deliberately has NO project_id column. A relation
 * is anchored to a project through its SOURCE entity, which is how the RLS
 * policies evaluate it:
 *
 *     private.entity_project_id(source_type, source_id)
 *
 * and the insert policy additionally requires the source and target to resolve
 * to the SAME project, so a relation can never straddle two projects.
 *
 * Querying `.eq('project_id', ...)` therefore fails outright with
 * "column context_relations.project_id does not exist". These helpers collect
 * the project's entity ids and filter on those instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextEntityType, ContextRelation } from "@/types/context";

/** Tables backing each context entity type, in graph order. */
const ENTITY_SOURCES: { type: ContextEntityType; table: string }[] = [
  { type: "task", table: "tasks" },
  { type: "phase", table: "roadmap_phases" },
  { type: "decision", table: "context_decisions" },
  { type: "file", table: "project_files" },
  { type: "source", table: "context_sources" },
  { type: "memory", table: "project_memory" },
];

export interface ProjectEntityIds {
  /** Every entity id belonging to the project, including the project itself. */
  all: string[];
  /** Ids grouped by entity type, for building pickers and labels. */
  byType: Record<ContextEntityType, string[]>;
}

/**
 * Collect the ids of everything in a project that can take part in a relation.
 * RLS already limits each query to rows the caller may see.
 */
export async function fetchProjectEntityIds(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectEntityIds> {
  const results = await Promise.all(
    ENTITY_SOURCES.map(async ({ type, table }) => {
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .eq("project_id", projectId);

      // A single unreadable table should not blank the whole graph.
      if (error) return { type, ids: [] as string[] };

      return { type, ids: (data ?? []).map((row: { id: string }) => row.id) };
    })
  );

  const byType = {
    project: [projectId],
    task: [],
    phase: [],
    decision: [],
    file: [],
    source: [],
    memory: [],
  } as Record<ContextEntityType, string[]>;

  for (const { type, ids } of results) {
    byType[type] = ids;
  }

  return {
    all: [projectId, ...results.flatMap((entry) => entry.ids)],
    byType,
  };
}

/**
 * Fetch every relation anchored to this project.
 *
 * Matching on source_id alone is sufficient: the insert policy guarantees the
 * target resolves to the same project, so a relation whose source is outside
 * the project is not this project's relation.
 */
export async function fetchProjectRelations(
  supabase: SupabaseClient,
  projectId: string,
  entityIds?: ProjectEntityIds
): Promise<ContextRelation[]> {
  const ids = entityIds ?? (await fetchProjectEntityIds(supabase, projectId));

  if (ids.all.length === 0) return [];

  const { data, error } = await supabase
    .from("context_relations")
    .select("*")
    .in("source_id", ids.all)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as ContextRelation[];
}
