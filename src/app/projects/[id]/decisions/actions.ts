"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
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

  if (hasDirectDatabase()) {
    let relationErrorMessage: string | null;

    try {
      [, relationErrorMessage] = await withUser(access.userId, async ({ query }) => {
        const result = await query(
          `INSERT INTO context_decisions
             (project_id, title, description, impact, alternatives, status, decision_type, made_by, made_at, source_type, source_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10)
           RETURNING id`,
          [
            projectId,
            parsed.title,
            parsed.description,
            parsed.impact,
            parsed.alternatives,
            parsed.status,
            parsed.decision_type,
            access.userId,
            linkSourceType,
            linkSourceId,
          ]
        );
        const id = result.rows[0].id as string;

        // Same "not rolled back together" reasoning as the Supabase branch
        // below — no cross-table transaction spanning both inserts at this
        // layer, so a relation failure here doesn't undo the decision.
        let relationError: string | null = null;
        if (hasLink) {
          try {
            await query(
              `INSERT INTO context_relations (source_type, source_id, target_type, target_id, relation_type, created_by)
               VALUES ($1, $2, 'decision', $3, 'decided_by', $4)`,
              [linkSourceType, linkSourceId, id, access.userId]
            );
          } catch (error) {
            relationError = error instanceof Error ? error.message : "Failed to link decision.";
          }
        }

        return [id, relationError] as const;
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to create decision." };
    }

    if (relationErrorMessage) {
      return { error: `Decision saved, but linking it failed: ${relationErrorMessage}` };
    }

    revalidatePath(`/projects/${projectId}/decisions`);
    revalidatePath(`/projects/${projectId}/context`);
    if (linkSourceType === "task") {
      revalidatePath(`/projects/${projectId}/work`);
    }
    return { error: null };
  }

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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          `UPDATE context_decisions
           SET title = $1, description = $2, impact = $3, alternatives = $4, status = $5, decision_type = $6
           WHERE id = $7`,
          [
            parsed.title,
            parsed.description,
            parsed.impact,
            parsed.alternatives,
            parsed.status,
            parsed.decision_type,
            decisionId,
          ]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update decision." };
    }

    revalidatePath(`/projects/${projectId}/decisions`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM context_decisions WHERE id = $1", [decisionId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete decision." };
    }

    revalidatePath(`/projects/${projectId}/decisions`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("context_decisions").delete().eq("id", decisionId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/decisions`);
  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}
