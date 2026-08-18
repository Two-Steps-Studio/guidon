"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import type { Decision } from "@/types/context";

export type DecisionFormState = {
  error: string | null;
};

const VALID_STATUSES: Decision["status"][] = ["proposed", "approved", "rejected", "deprecated"];
const VALID_TYPES: Decision["decision_type"][] = [
  "technical",
  "architectural",
  "product",
  "business",
  "process",
  "other",
];
const VALID_ENTITY_TYPES: Decision["source_type"][] = [
  "project",
  "task",
  "phase",
  "decision",
  "file",
  "source",
  "memory",
];

function parseDecisionForm(formData: FormData) {
  const title = formData.get("title");
  const description = formData.get("description");
  const impact = formData.get("impact");
  const alternativesRaw = formData.get("alternatives");
  const status = formData.get("status");
  const decisionType = formData.get("decision_type");

  if (typeof title !== "string" || title.trim().length === 0) {
    return { error: "Title is required." } as const;
  }
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as Decision["status"])) {
    return { error: "Invalid status." } as const;
  }
  if (
    typeof decisionType !== "string" ||
    !VALID_TYPES.includes(decisionType as Decision["decision_type"])
  ) {
    return { error: "Invalid decision type." } as const;
  }

  const alternatives =
    typeof alternativesRaw === "string"
      ? alternativesRaw.split("\n").map((line) => line.trim()).filter(Boolean)
      : [];

  return {
    error: null,
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    impact: typeof impact === "string" && impact.trim() ? impact.trim() : null,
    alternatives,
    status: status as Decision["status"],
    decision_type: decisionType as Decision["decision_type"],
  } as const;
}

// Mirrors decisions_insert/update (001): owner/admin/developer; delete: owner/admin only.

export async function createDecision(
  projectId: string,
  _prevState: DecisionFormState,
  formData: FormData
): Promise<DecisionFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to add decisions." };
  }

  const parsed = parseDecisionForm(formData);
  if (parsed.error) return { error: parsed.error };

  // Optional: "mark comment as decision" (TaskDetailDialog, work/actions.ts
  // posts these as hidden fields via CreateDecisionDialog's `link` prop).
  // When present, the decision records where it was captured from AND a
  // context_relations row is created so it shows up in the task's Why panel
  // (getTaskWhyContext, src/lib/context/task-why.ts) without a page reload.
  const linkSourceTypeRaw = formData.get("link_source_type");
  const linkSourceIdRaw = formData.get("link_source_id");
  const hasLink =
    typeof linkSourceTypeRaw === "string" &&
    VALID_ENTITY_TYPES.includes(linkSourceTypeRaw as Decision["source_type"]) &&
    typeof linkSourceIdRaw === "string" &&
    linkSourceIdRaw.trim().length > 0;
  const linkSourceType = hasLink ? (linkSourceTypeRaw as string) : null;
  const linkSourceId = hasLink ? (linkSourceIdRaw as string).trim() : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("context_decisions")
    .insert({
      project_id: projectId,
      title: parsed.title,
      description: parsed.description,
      impact: parsed.impact,
      alternatives: parsed.alternatives,
      status: parsed.status,
      decision_type: parsed.decision_type,
      // context_decisions records the author as made_by, not created_by.
      made_by: access.userId,
      made_at: new Date().toISOString(),
      source_type: linkSourceType,
      source_id: linkSourceId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (hasLink && data) {
    // Mirrors context_relations_insert (001, rewritten by migration 011):
    // owner/admin/developer — same tier already required above, so this
    // never fails on permissions when the first insert succeeded. Not
    // rolled back together with the decision (no cross-table transaction
    // available at this layer): if this second insert fails, the decision
    // itself is still saved, it just will not appear as linked yet.
    const { error: relationError } = await supabase.from("context_relations").insert({
      source_type: linkSourceType,
      source_id: linkSourceId,
      target_type: "decision",
      target_id: data.id,
      relation_type: "decided_by",
      created_by: access.userId,
    });

    if (relationError) {
      return { error: `Decision saved, but linking it failed: ${relationError.message}` };
    }
  }

  revalidatePath(`/projects/${projectId}/decisions`);
  revalidatePath(`/projects/${projectId}/context`);
  if (linkSourceType === "task") {
    revalidatePath(`/projects/${projectId}/work`);
  }
  return { error: null };
}

export async function updateDecision(
  projectId: string,
  decisionId: string,
  _prevState: DecisionFormState,
  formData: FormData
): Promise<DecisionFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to edit decisions." };
  }

  const parsed = parseDecisionForm(formData);
  if (parsed.error) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("context_decisions")
    .update({
      title: parsed.title,
      description: parsed.description,
      impact: parsed.impact,
      alternatives: parsed.alternatives,
      status: parsed.status,
      decision_type: parsed.decision_type,
    })
    .eq("id", decisionId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/decisions`);
  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}

export async function deleteDecision(
  projectId: string,
  decisionId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete decisions." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("context_decisions").delete().eq("id", decisionId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/decisions`);
  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}
