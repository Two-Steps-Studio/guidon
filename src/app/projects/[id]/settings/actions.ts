"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser, type DbSession } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import { ensureBucketExists, uploadFile } from "@/lib/storage/storage";
import { assertSafeStoragePath } from "@/lib/storage/provider";
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

  if (toAdd.length > 0) {
    // Single batched insert via unnest() rather than one INSERT per row —
    // toAdd is small in practice, but there's no reason to pay for N
    // sequential round trips when one query does the same job.
    await query(
      `INSERT INTO technologies (project_id, name, icon_slug, category, sort_order)
       SELECT $1, name, icon_slug, category, sort_order
       FROM unnest($2::text[], $3::text[], $4::text[], $5::int[])
         AS t(name, icon_slug, category, sort_order)`,
      [
        projectId,
        toAdd.map((name) => name.trim()),
        toAdd.map((name) => technologySlug(name)),
        toAdd.map((name) => guessTechnologyCategory(name)),
        toAdd.map((_, index) => existing.length + index),
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
  const colorHex = formData.get("colorHex");
  const technologiesRaw = formData.get("technologies");
  const avatarFile = formData.get("avatar") as File | null;

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Project name is required." };
  }
  if (typeof status !== "string" || !VALID_STATUSES.includes(status as ProjectStatus)) {
    return { error: "Invalid status." };
  }

  let avatarUrl: string | null | undefined;
  if (avatarFile && avatarFile.size > 0) {
    if (!avatarFile.type.startsWith("image/")) {
      return { error: "Project image must be an image file." };
    }
    if (avatarFile.size > 2 * 1024 * 1024) {
      return { error: "Project image is too large. Maximum size: 2MB" };
    }

    const bucketResult = await ensureBucketExists("avatars", { public: true });
    if (bucketResult.error) {
      return { error: `Storage bucket could not be created: ${bucketResult.error}` };
    }

    const timestamp = Date.now();
    const extension = avatarFile.name.split(".").pop() || "jpg";
    const filePath = assertSafeStoragePath(`projects/${projectId}/${timestamp}.${extension}`);

    try {
      const uploadResult = await uploadFile("avatars", filePath, avatarFile, {
        upsert: true,
        public: true,
      });
      avatarUrl = uploadResult.publicUrl;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to upload project image." };
    }
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

  // Validate color format
  let trimmedColor = null;
  if (typeof colorHex === "string" && colorHex.trim()) {
    const colorMatch = colorHex.trim().match(/^#([0-9A-Fa-f]{6})$/);
    if (colorMatch) {
      trimmedColor = colorMatch[0];
    } else {
      return { error: "Invalid color format. Use hex format like #0f6b5a." };
    }
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, async ({ query }) => {
        await query(
          `UPDATE projects
           SET name = $1, description = $2, status = $3, color = $4,
               avatar_url = COALESCE($5, avatar_url)
           WHERE id = $6`,
          [name.trim(), trimmedDescription, status, trimmedColor, avatarUrl ?? null, projectId]
        );

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
        color: trimmedColor,
        ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
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

  await logActivity({
    userId: access.userId,
    action: "project_updated",
    projectId,
    entityType: "project",
    entityId: projectId,
  });

  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/layout`);
  return { error: null };
}

export async function deleteProject(projectId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);

  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete this project." };
  }

  // Logged before the delete, with organization_id instead of project_id:
  // activity_logs.project_id has ON DELETE CASCADE from projects (001), so a
  // row scoped by the very project it records would be deleted along with it.
  await logActivity({
    userId: access.userId,
    action: "project_deleted",
    organizationId: access.project.organization_id,
    entityType: "project",
    entityId: projectId,
    details: { name: access.project.name },
  });

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
