"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
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

  const supabase = await createClient();
  const payload = {
    name: input.name.trim(),
    category: input.category,
    version: input.version.trim() || null,
    description: input.description.trim() || null,
    icon_slug: technologySlug(input.name),
  };

  const query = input.id
    ? supabase.from("technologies").update(payload).eq("id", input.id)
    : supabase.from("technologies").insert({
        ...payload,
        project_id: projectId,
        sort_order: input.existingCount,
      });

  const { data, error } = await query.select().single();

  if (error) {
    // Most likely cause when the value is game_engine and migration 008 has
    // not run yet.
    const message =
      /violates check constraint/i.test(error.message) && input.category === "game_engine"
        ? "The database does not accept 'Game engine' yet — run migration 008."
        : error.message;
    return { technology: null, error: message };
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

  const supabase = await createClient();
  const { error } = await supabase.from("technologies").delete().eq("id", technologyId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/technology`);
  return { error: null };
}
