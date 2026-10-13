"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import {
  LABEL_NAME_MAX_LENGTH,
  isValidLabelColor,
  type LabelPreset,
} from "@/lib/work/label-presets";

type Result = { preset: LabelPreset | null; error: string | null };

const COLUMNS = "id, name, color, sort_order";
const NO_PERMISSION = "Only the project's owner or admins can change label presets.";

function validate(name: string, color: string): string | null {
  if (!name) return "Enter a label name.";
  if (name.length > LABEL_NAME_MAX_LENGTH) return `Label names can be at most ${LABEL_NAME_MAX_LENGTH} characters.`;
  if (name.includes(",")) return "Label names can't contain commas.";
  if (!isValidLabelColor(color)) return "Pick a colour from the list.";
  return null;
}

function friendlyError(error: { code?: string; message: string }): string {
  return error.code === "23505" ? "A label with this name already exists in this project." : error.message;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}/work`);
}

export async function addLabelPreset(projectId: string, rawName: string, color: string): Promise<Result> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { preset: null, error: NO_PERMISSION };

  const name = rawName.trim();
  const invalid = validate(name, color);
  if (invalid) return { preset: null, error: invalid };

  const db = dataClient(access.userId);
  const { data: count } = await db.from("project_label_presets").eq("project_id", projectId).count();

  const { data: preset, error } = await db
    .from("project_label_presets")
    .insert({ project_id: projectId, name, color, sort_order: count ?? 0 })
    .select<LabelPreset>(COLUMNS)
    .single();
  if (error || !preset) return { preset: null, error: error ? friendlyError(error) : "Failed to add the label." };

  revalidate(projectId);
  return { preset, error: null };
}

export async function updateLabelPreset(
  projectId: string,
  presetId: string,
  rawName: string,
  color: string
): Promise<Result> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { preset: null, error: NO_PERMISSION };

  const name = rawName.trim();
  const invalid = validate(name, color);
  if (invalid) return { preset: null, error: invalid };

  const { data: preset, error } = await dataClient(access.userId)
    .from("project_label_presets")
    .update({ name, color })
    .eq("id", presetId)
    .eq("project_id", projectId)
    .select<LabelPreset>(COLUMNS)
    .maybeSingle();
  if (error) return { preset: null, error: friendlyError(error) };
  if (!preset) return { preset: null, error: "Label not found." };

  revalidate(projectId);
  return { preset, error: null };
}

/** Tasks keep the label as plain text - only the preset (colour, suggestion) goes away. */
export async function deleteLabelPreset(projectId: string, presetId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: NO_PERMISSION };

  const { data: deleted, error } = await dataClient(access.userId)
    .from("project_label_presets")
    .delete()
    .eq("id", presetId)
    .eq("project_id", projectId)
    .select<{ id: string }>("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!deleted) return { error: "Label not found." };

  revalidate(projectId);
  return { error: null };
}

/**
 * Adds a starter set (LABEL_STARTER_SETS, names already translated by the
 * client) - skipping names the project already has, case-insensitively, so
 * it can be applied on top of existing labels or twice without errors.
 */
export async function addLabelPresetSet(
  projectId: string,
  labels: Array<{ name: string; color: string }>
): Promise<{ added: LabelPreset[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { added: [], error: NO_PERMISSION };
  if (labels.length === 0 || labels.length > 20) return { added: [], error: "Invalid label set." };
  for (const label of labels) {
    const invalid = validate(label.name.trim(), label.color);
    if (invalid) return { added: [], error: invalid };
  }

  const db = dataClient(access.userId);
  const { data: existing, error: listError } = await db
    .from<{ name: string }>("project_label_presets")
    .select("name")
    .eq("project_id", projectId);
  if (listError) return { added: [], error: listError.message };
  const taken = new Set((existing ?? []).map((row) => row.name.toLowerCase()));
  let sortOrder = existing?.length ?? 0;

  const added: LabelPreset[] = [];
  for (const label of labels) {
    const name = label.name.trim();
    if (taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());
    const { data: preset, error } = await db
      .from("project_label_presets")
      .insert({ project_id: projectId, name, color: label.color, sort_order: sortOrder++ })
      .select<LabelPreset>(COLUMNS)
      .single();
    // A concurrent add of the same name loses the race on the unique index - skip it.
    if (error?.code === "23505") continue;
    if (error || !preset) return { added, error: error?.message ?? "Failed to add the labels." };
    added.push(preset);
  }

  if (added.length > 0) revalidate(projectId);
  return { added, error: null };
}
