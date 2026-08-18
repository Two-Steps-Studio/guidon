/**
 * Scoping helper for context_relations.
 *
 * Before migration 011, context_relations had no project_id column — a
 * relation was anchored to a project only through its source entity, which
 * meant fetching a project's relations required first collecting every
 * entity id in the project (tasks, phases, decisions, files, sources,
 * memory) across six tables, then filtering with `.in('source_id', [...])`.
 * That does not scale with project size (docs/self-hosting-audit.md §D).
 *
 * 011 added `project_id`, populated by a trigger from source_type/source_id
 * (never client input — see the migration's own comment block), so this is
 * now a direct, indexed lookup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextRelation } from "@/types/context";

/** Fetch every relation anchored to this project. */
export async function fetchProjectRelations(
  supabase: SupabaseClient,
  projectId: string
): Promise<ContextRelation[]> {
  const { data, error } = await supabase
    .from("context_relations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as ContextRelation[];
}
