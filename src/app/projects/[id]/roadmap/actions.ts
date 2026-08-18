"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import type { PhaseStatus } from "@/types/task";

export type PhaseFormState = {
  error: string | null;
};

const VALID_STATUSES: PhaseStatus[] = ["planned", "in_progress", "completed", "blocked"];

function parsePhaseForm(formData: FormData) {
  const name = formData.get("name");
  const description = formData.get("description");
  const startDate = formData.get("start_date");
  const plannedEndDate = formData.get("planned_end_date");
  const status = formData.get("status");
  const completion = formData.get("completion_percentage");

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Phase name is required." } as const;
  }
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as PhaseStatus)) {
    return { error: "Invalid status." } as const;
  }

  const completionValue = Number(completion);

  return {
    error: null,
    name: name.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    start_date: typeof startDate === "string" && startDate ? startDate : null,
    planned_end_date: typeof plannedEndDate === "string" && plannedEndDate ? plannedEndDate : null,
    status: status as PhaseStatus,
    completion_percentage: Number.isFinite(completionValue)
      ? Math.min(100, Math.max(0, Math.round(completionValue)))
      : 0,
  } as const;
}

// Mirrors roadmap_insert/update/delete (001): owner/admin only — unlike
// tasks and memory, roadmap phases do not extend write access to developer.

export async function createPhase(
  projectId: string,
  _prevState: PhaseFormState,
  formData: FormData
): Promise<PhaseFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to add roadmap phases." };
  }

  const parsed = parsePhaseForm(formData);
  if (parsed.error) return { error: parsed.error };

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, async ({ query }) => {
        const siblings = await query(
          "SELECT sort_order FROM roadmap_phases WHERE project_id = $1",
          [projectId]
        );
        const maxSortOrder = siblings.rows.reduce(
          (max: number, p: { sort_order: number | null }) => Math.max(max, p.sort_order ?? 0),
          0
        );

        await query(
          `INSERT INTO roadmap_phases
             (project_id, name, description, start_date, planned_end_date, status, completion_percentage, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            projectId,
            parsed.name,
            parsed.description,
            parsed.start_date,
            parsed.planned_end_date,
            parsed.status,
            parsed.completion_percentage,
            maxSortOrder + 1,
            access.userId,
          ]
        );
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to add roadmap phase." };
    }

    revalidatePath(`/projects/${projectId}/roadmap`);
    return { error: null };
  }

  const supabase = await createClient();
  const { data: siblings } = await supabase
    .from("roadmap_phases")
    .select("sort_order")
    .eq("project_id", projectId);

  const maxSortOrder = (siblings ?? []).reduce((max, p) => Math.max(max, p.sort_order ?? 0), 0);

  const { error } = await supabase.from("roadmap_phases").insert({
    project_id: projectId,
    name: parsed.name,
    description: parsed.description,
    start_date: parsed.start_date,
    planned_end_date: parsed.planned_end_date,
    status: parsed.status,
    completion_percentage: parsed.completion_percentage,
    sort_order: maxSortOrder + 1,
    created_by: access.userId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/roadmap`);
  return { error: null };
}

export async function updatePhase(
  projectId: string,
  phaseId: string,
  _prevState: PhaseFormState,
  formData: FormData
): Promise<PhaseFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to edit roadmap phases." };
  }

  const parsed = parsePhaseForm(formData);
  if (parsed.error) return { error: parsed.error };

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          `UPDATE roadmap_phases
           SET name = $1, description = $2, start_date = $3, planned_end_date = $4, status = $5, completion_percentage = $6
           WHERE id = $7`,
          [
            parsed.name,
            parsed.description,
            parsed.start_date,
            parsed.planned_end_date,
            parsed.status,
            parsed.completion_percentage,
            phaseId,
          ]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update roadmap phase." };
    }

    revalidatePath(`/projects/${projectId}/roadmap`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("roadmap_phases")
    .update({
      name: parsed.name,
      description: parsed.description,
      start_date: parsed.start_date,
      planned_end_date: parsed.planned_end_date,
      status: parsed.status,
      completion_percentage: parsed.completion_percentage,
    })
    .eq("id", phaseId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/roadmap`);
  return { error: null };
}

export async function deletePhase(
  projectId: string,
  phaseId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete roadmap phases." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM roadmap_phases WHERE id = $1", [phaseId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete roadmap phase." };
    }

    revalidatePath(`/projects/${projectId}/roadmap`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_phases").delete().eq("id", phaseId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/roadmap`);
  return { error: null };
}
