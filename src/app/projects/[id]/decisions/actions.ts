"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import type { ActivityAction } from "@/types/api";
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

function revalidateDecisionViews(projectId: string) {
  revalidatePath(`/projects/${projectId}/decisions`);
  revalidatePath(`/projects/${projectId}/context`);
}

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

  const db = dataClient(access.userId);
  const { data: decision, error } = await db
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
    .select<{ id: string }>("id")
    .single();

  if (error || !decision) return { error: error?.message ?? "Failed to create decision." };

  await logActivity({
    userId: access.userId,
    action: "decision_created",
    projectId,
    entityType: "decision",
    entityId: decision.id,
    details: { title: parsed.title },
  });

  if (hasLink) {
    // Mirrors context_relations_insert (001, rewritten by migration 011):
    // owner/admin/developer - same tier already required above, so this
    // never fails on permissions when the first insert succeeded. A separate
    // write on purpose: if linking fails, the decision itself stays saved
    // and the caller is told only the link is missing. (The old self-hosted
    // branch ran both inserts in one transaction, where a failed link
    // aborted the transaction and lost the decision too.)
    const { error: relationError } = await db.from("context_relations").insert({
      source_type: linkSourceType,
      source_id: linkSourceId,
      target_type: "decision",
      target_id: decision.id,
      relation_type: "decided_by",
      created_by: access.userId,
    });

    if (relationError) {
      return { error: `Decision saved, but linking it failed: ${relationError.message}` };
    }
  }

  revalidateDecisionViews(projectId);
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

  const action: ActivityAction =
    parsed.status === "approved"
      ? "decision_approved"
      : parsed.status === "rejected"
        ? "decision_rejected"
        : "decision_updated";

  // project_id scoping plus a RETURNING/row-count check: a decisionId that
  // doesn't belong to projectId (stale client state, or a crafted request
  // against a decision from a different project this caller also has a role
  // on) - or one RLS silently filtered - must not come back as success with
  // a misleading activity entry. Same bug class as setStatusAndLog
  // (lib/api/task-transitions.ts).
  const { data, error } = await dataClient(access.userId)
    .from("context_decisions")
    .update({
      title: parsed.title,
      description: parsed.description,
      impact: parsed.impact,
      alternatives: parsed.alternatives,
      status: parsed.status,
      decision_type: parsed.decision_type,
    })
    .eq("id", decisionId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) return { error: "This decision does not belong to this project." };

  await logActivity({
    userId: access.userId,
    action,
    projectId,
    entityType: "decision",
    entityId: decisionId,
    details: { title: parsed.title },
  });

  revalidateDecisionViews(projectId);
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

  const { data, error } = await dataClient(access.userId)
    .from("context_decisions")
    .delete()
    .eq("id", decisionId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) return { error: "This decision does not belong to this project." };

  revalidateDecisionViews(projectId);
  return { error: null };
}
