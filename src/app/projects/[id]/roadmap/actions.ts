"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import type { PhaseStatus } from "@/types/task";

export type PhaseFormState = {
  error: string | null;
};

const VALID_STATUSES: PhaseStatus[] = ["planned", "in_progress", "completed", "blocked"];

// completion_percentage and status below are entirely operator-entered and
// deliberately never derived from or reconciled against a phase's linked
// tasks (context_relations, relation_type 'part_of' - itself only ever
// populated by importing a previously-exported .guidon file, not by any
// live UI action). Completing every linked task, or deleting them all, has
// no effect on a phase's displayed completion - this is intentional manual
// tracking, not a sync gap: a phase's real-world completion is a judgment
// call the person managing the roadmap makes, not something to compute
// from task checkboxes.
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
  if (
    typeof startDate === "string" &&
    startDate &&
    typeof plannedEndDate === "string" &&
    plannedEndDate &&
    plannedEndDate < startDate
  ) {
    return { error: "Planned end date can't be before the start date." } as const;
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

// Mirrors roadmap_insert/update/delete (001): owner/admin only - unlike
// tasks and memory, roadmap phases do not extend write access to developer.

const NOT_IN_PROJECT = "This phase could not be found in this project.";

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

  const db = dataClient(access.userId);

  // New phases go last.
  const { data: last } = await db
    .from("roadmap_phases")
    .select<{ sort_order: number | null }>("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await db
    .from("roadmap_phases")
    .insert({
      project_id: projectId,
      name: parsed.name,
      description: parsed.description,
      start_date: parsed.start_date,
      planned_end_date: parsed.planned_end_date,
      status: parsed.status,
      completion_percentage: parsed.completion_percentage,
      sort_order: (last?.sort_order ?? 0) + 1,
      created_by: access.userId,
    })
    .select<{ id: string }>("id")
    .single();

  if (error || !created) return { error: error?.message ?? "Failed to add roadmap phase." };

  await logActivity({
    userId: access.userId,
    action: "phase_created",
    projectId,
    entityType: "phase",
    entityId: created.id,
    details: { name: parsed.name },
  });

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

  const { data, error } = await dataClient(access.userId)
    .from("roadmap_phases")
    .update({
      name: parsed.name,
      description: parsed.description,
      start_date: parsed.start_date,
      planned_end_date: parsed.planned_end_date,
      status: parsed.status,
      completion_percentage: parsed.completion_percentage,
    })
    .eq("id", phaseId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) return { error: NOT_IN_PROJECT };

  await logActivity({
    userId: access.userId,
    action: "phase_updated",
    projectId,
    entityType: "phase",
    entityId: phaseId,
  });

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

  const { data, error } = await dataClient(access.userId)
    .from("roadmap_phases")
    .delete()
    .eq("id", phaseId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) return { error: NOT_IN_PROJECT };

  await logActivity({
    userId: access.userId,
    action: "phase_deleted",
    projectId,
    entityType: "phase",
    entityId: phaseId,
  });

  revalidatePath(`/projects/${projectId}/roadmap`);
  return { error: null };
}
