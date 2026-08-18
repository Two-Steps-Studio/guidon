"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { guessTechnologyCategory, technologySlug } from "@/types/technology";
import type { ProjectStatus } from "@/types/project";
import type { Technology } from "@/types/technology";

export type SettingsFormState = {
  error: string | null;
};

const VALID_STATUSES: ProjectStatus[] = ["active", "archived", "deleted"];

/**
 * Reconciles the edited technology names against the technologies table:
 * inserts what was added, deletes what was removed, leaves the rest alone.
 * Matching is by case-insensitive name, which is how the chip UI treats them.
 */
async function syncTechnologies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  existing: Technology[],
  desired: string[]
) {
  const key = (value: string) => value.trim().toLowerCase();
  const desiredKeys = new Set(desired.map(key));
  const existingKeys = new Set(existing.map((tech) => key(tech.name)));

  const toAdd = desired.filter((name) => !existingKeys.has(key(name)));
  const toRemove = existing.filter((tech) => !desiredKeys.has(key(tech.name)));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("technologies").insert(
      toAdd.map((name, index) => ({
        project_id: projectId,
        name: name.trim(),
        icon_slug: technologySlug(name),
        // NOT NULL in the database; guessTechnologyCategory always resolves.
        category: guessTechnologyCategory(name),
        sort_order: existing.length + index,
      }))
    );
    if (error) throw error;
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("technologies")
      .delete()
      .in("id", toRemove.map((tech) => tech.id));
    if (error) throw error;
  }
}

export async function updateProjectSettings(
  projectId: string,
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const access = await getProjectAccess(projectId);

  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to edit this project." };
  }

  const name = formData.get("name");
  const description = formData.get("description");
  const status = formData.get("status");
  const technologiesRaw = formData.get("technologies");

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Project name is required." };
  }
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as ProjectStatus)) {
    return { error: "Invalid status." };
  }

  let technologies: string[] = [];
  if (typeof technologiesRaw === "string" && technologiesRaw.length > 0) {
    try {
      const parsed = JSON.parse(technologiesRaw);
      if (Array.isArray(parsed)) technologies = parsed.filter((v) => typeof v === "string");
    } catch {
      return { error: "Invalid technologies payload." };
    }
  }

  const supabase = await createClient();

  // `technologies` is a separate table, not a column on projects — sending
  // it in this update is what made every save fail with PGRST204.
  const { error } = await supabase
    .from("projects")
    .update({
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      status: status as ProjectStatus,
    })
    .eq("id", projectId);

  if (error) {
    return { error: error.message };
  }

  try {
    const { data: existingTech } = await supabase
      .from("technologies")
      .select("*")
      .eq("project_id", projectId);
    await syncTechnologies(supabase, projectId, (existingTech ?? []) as Technology[], technologies);
  } catch (syncError) {
    return { error: syncError instanceof Error ? syncError.message : "Failed to update technologies." };
  }

  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}

export async function deleteProject(projectId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);

  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete this project." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    return { error: error.message };
  }

  redirect("/organizations");
}
