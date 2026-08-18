"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export type UpdateProjectState = {
  error: string | null;
};

/**
 * Updates a project's name and description.
 *
 * RLS is still the real boundary — this check exists so a developer or
 * tester gets "you can't edit this project" instead of a raw Postgres
 * error surfaced as a generic failure (TODO.md §33, §38).
 */
export async function updateProject(
  projectId: string,
  _prevState: UpdateProjectState,
  formData: FormData
): Promise<UpdateProjectState> {
  const access = await getProjectAccess(projectId);

  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to edit this project." };
  }

  const name = formData.get("name");
  const description = formData.get("description");

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Project name is required." };
  }

  const trimmedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("UPDATE projects SET name = $1, description = $2 WHERE id = $3", [
          name.trim(),
          trimmedDescription,
          projectId,
        ])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update project." };
    }

    revalidatePath(`/projects/${projectId}`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name: name.trim(),
      description: trimmedDescription,
    })
    .eq("id", projectId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}
