"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser, type DbSession } from "@/lib/db/session";
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

/** Same reconciliation as syncTechnologies, against a pg session instead of the Supabase client. */
async function syncTechnologiesLocal(
  query: DbSession["query"],
  projectId: string,
  existing: Technology[],
  desired: string[]
) {
  const key = (value: string) => value.trim().toLowerCase();
  const desiredKeys = new Set(desired.map(key));
  const existingKeys = new Set(existing.map((tech) => key(tech.name)));

  const toAdd = desired.filter((name) => !existingKeys.has(key(name)));
  const toRemove = existing.filter((tech) => !desiredKeys.has(key(tech.name)));

  for (const [index, name] of toAdd.entries()) {
    await query(
      `INSERT INTO technologies (project_id, name, icon_slug, category, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        projectId,
        name.trim(),
        technologySlug(name),
        guessTechnologyCategory(name),
        existing.length + index,
      ]
    );
  }

  if (toRemove.length > 0) {
    await query(
      "DELETE FROM technologies WHERE id = ANY($1::uuid[])",
      [toRemove.map((tech) => tech.id)]
    );
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

  const trimmedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, async ({ query }) => {
        await query("UPDATE projects SET name = $1, description = $2, status = $3 WHERE id = $4", [
          name.trim(),
          trimmedDescription,
          status,
          projectId,
        ]);

        const existingTech = await query("SELECT * FROM technologies WHERE project_id = $1", [
          projectId,
        ]);
        await syncTechnologiesLocal(query, projectId, existingTech.rows, technologies);
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update project." };
    }
  } else {
    const supabase = await createClient();

    // `technologies` is a separate table, not a column on projects — sending
    // it in this update is what made every save fail with PGRST204.
    const { error } = await supabase
      .from("projects")
      .update({
        name: name.trim(),
        description: trimmedDescription,
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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM projects WHERE id = $1", [projectId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete project." };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from("projects").delete().eq("id", projectId);

    if (error) {
      return { error: error.message };
    }
  }

  redirect("/organizations");
}
