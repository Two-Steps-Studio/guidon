"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { isProjectModule, normalizeDisabledModules } from "@/lib/work/project-modules";

/** Owner/admin only - same as the projects_update policy (001) it goes through. */
export async function updateProjectModules(
  projectId: string,
  disabled: string[]
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "Only the project's owner or admins can change its modules." };
  }
  if (!disabled.every(isProjectModule)) return { error: "Unknown module." };

  const { data, error } = await dataClient(access.userId)
    .from("projects")
    .update({ disabled_modules: normalizeDisabledModules(disabled) })
    .eq("id", projectId)
    .select<{ id: string }>("id");
  if (error) return { error: error.message };
  if (data.length === 0) return { error: "Project not found." };

  // The nav lives in the project layout, so every page under it changes.
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}
