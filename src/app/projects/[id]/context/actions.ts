"use server";

import { revalidatePath } from "next/cache";
import { getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import type { ContextEntityType, RelationType } from "@/types/context";

export type RelationFormState = { error: string | null };
export type RelationMutationResult = { error: string | null };

const ENTITY_TYPES: ContextEntityType[] = [
  "project",
  "task",
  "phase",
  "decision",
  "file",
  "source",
  "memory",
];

const RELATION_TYPES: RelationType[] = [
  "depends_on",
  "blocks",
  "implements",
  "references",
  "decided_by",
  "based_on",
  "related_to",
  "contradicts",
  "supersedes",
  "part_of",
  "contains",
];

/**
 * Mirrors context_relations_insert (001, rewritten by migration 011): a
 * BEFORE INSERT trigger derives project_id from source_type/source_id (never
 * client input), and RLS rejects the insert if target_type/target_id does
 * not resolve to that same project - a relation can never cross projects.
 * The caller needs owner/admin/developer on that project; delete requires
 * owner/admin.
 */
export async function createRelation(
  projectId: string,
  _prevState: RelationFormState,
  formData: FormData
): Promise<RelationFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || (access.role !== "owner" && access.role !== "admin" && access.role !== "developer")) {
    return { error: "You do not have permission to create relations." };
  }

  const sourceType = formData.get("source_type");
  const sourceId = formData.get("source_id");
  const targetType = formData.get("target_type");
  const targetId = formData.get("target_id");
  const relationType = formData.get("relation_type");

  if (typeof sourceType !== "string" || !ENTITY_TYPES.includes(sourceType as ContextEntityType)) {
    return { error: "Invalid source type." };
  }
  if (typeof targetType !== "string" || !ENTITY_TYPES.includes(targetType as ContextEntityType)) {
    return { error: "Invalid target type." };
  }
  if (typeof relationType !== "string" || !RELATION_TYPES.includes(relationType as RelationType)) {
    return { error: "Invalid relation type." };
  }
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    return { error: "Source is required." };
  }
  if (typeof targetId !== "string" || !targetId.trim()) {
    return { error: "Target is required." };
  }

  const { error } = await dataClient(access.userId).from("context_relations").insert({
    source_type: sourceType,
    source_id: sourceId.trim(),
    target_type: targetType,
    target_id: targetId.trim(),
    relation_type: relationType,
    created_by: access.userId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}

export async function deleteRelation(
  projectId: string,
  relationId: string
): Promise<RelationMutationResult> {
  const access = await getProjectAccess(projectId);
  if (!access || (access.role !== "owner" && access.role !== "admin")) {
    return { error: "You do not have permission to delete relations." };
  }

  // Scoped to project_id and checks the row count, same reasoning as
  // deleteTask in work/actions.ts: a relationId that doesn't belong to this
  // project (stale client state, or simply the wrong id) must not come back
  // as a silent "success" with nothing actually removed.
  const { data, error } = await dataClient(access.userId)
    .from("context_relations")
    .delete()
    .eq("id", relationId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) {
    return { error: "This relation could not be found in this project." };
  }

  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}
