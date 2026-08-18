"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
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

  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_phases").delete().eq("id", phaseId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/roadmap`);
  return { error: null };
}
