"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { technologySlug } from "@/types/technology";
import type { Technology, TechnologyCategory } from "@/types/technology";

export type TechnologyResult = { technology: Technology | null; error: string | null };
export type TechnologyMutationResult = { error: string | null };

// Mirrors technologies_insert/update/delete (001): owner/admin only.

export async function saveTechnology(
  projectId: string,
  input: {
    id: string | null;
    name: string;
    category: TechnologyCategory;
    version: string;
    description: string;
    existingCount: number;
  }
): Promise<TechnologyResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { technology: null, error: "You do not have permission to change the stack." };
  }
  if (!input.name.trim()) {
    return { technology: null, error: "Name is required." };
  }

  const payload = {
    name: input.name.trim(),
    category: input.category,
    version: input.version.trim() || null,
    description: input.description.trim() || null,
    icon_slug: technologySlug(input.name),
  };

  // Most likely cause when the value is game_engine and migration 008 has
  // not run yet.
  const gameEngineHint = (message: string): string =>
    /violates check constraint/i.test(message) && input.category === "game_engine"
      ? "The database does not accept 'Game engine' yet — run migration 008."
      : message;

  if (hasDirectDatabase()) {
    try {
      const technology = await withUser(access.userId, ({ query }) => {
        if (input.id) {
          return query(
            `UPDATE technologies SET name = $1, category = $2, version = $3, description = $4, icon_slug = $5
             WHERE id = $6
             RETURNING *`,
            [payload.name, payload.category, payload.version, payload.description, payload.icon_slug, input.id]
          ).then((result) => result.rows[0]);
        }

        return query(
          `INSERT INTO technologies (name, category, version, description, icon_slug, project_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            payload.name,
            payload.category,
            payload.version,
            payload.description,
            payload.icon_slug,
            projectId,
            input.existingCount,
          ]
        ).then((result) => result.rows[0]);
      });

      revalidatePath(`/projects/${projectId}/technology`);
      return { technology: technology as Technology, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save technology.";
      return { technology: null, error: gameEngineHint(message) };
    }
  }

  const supabase = await createClient();

  const query = input.id
    ? supabase.from("technologies").update(payload).eq("id", input.id)
    : supabase.from("technologies").insert({
        ...payload,
        project_id: projectId,
        sort_order: input.existingCount,
      });

  const { data, error } = await query.select().single();

  if (error) {
    return { technology: null, error: gameEngineHint(error.message) };
  }

  revalidatePath(`/projects/${projectId}/technology`);
  return { technology: data as Technology, error: null };
}

export async function deleteTechnology(
  projectId: string,
  technologyId: string
): Promise<TechnologyMutationResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change the stack." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM technologies WHERE id = $1", [technologyId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to change the stack." };
    }

    revalidatePath(`/projects/${projectId}/technology`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("technologies").delete().eq("id", technologyId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/technology`);
  return { error: null };
}
