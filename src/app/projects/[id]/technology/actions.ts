"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
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
      ? "The database does not accept 'Game engine' yet - run migration 008."
      : message;

  // No UNIQUE(project_id, lower(name)) at the DB level - technologies is a
  // free-text tag list, not identity-bearing the way a membership row is,
  // so this is a plain app-layer check rather than a migration. syncTechnologies/
  // syncTechnologiesLocal (settings/actions.ts) already dedupe case-
  // insensitively when the whole stack is edited as a list from Settings;
  // this is the other entry point (this project's own Technology page).
  //
  // Case-insensitive exact match: ILIKE with LIKE's wildcards escaped - an
  // unescaped `_`/`%` in a name like "C_" used to match "CS" here (Supabase
  // mode only; self-hosted compared lower(name) exactly).
  const db = dataClient(access.userId);
  const { data: duplicates, error: duplicateError } = await db
    .from("technologies")
    .select<{ id: string }>("id")
    .eq("project_id", projectId)
    .ilike("name", payload.name.replace(/[\\%_]/g, "\\$&"));
  if (duplicateError) return { technology: null, error: duplicateError.message };
  if (duplicates.some((row) => row.id !== input.id)) {
    return { technology: null, error: `"${payload.name}" is already in this project's stack.` };
  }

  const { data, error } = input.id
    ? await db
        .from("technologies")
        .update(payload)
        .eq("id", input.id)
        .eq("project_id", projectId)
        .select<Technology>("*")
        .maybeSingle()
    : await db
        .from("technologies")
        .insert({ ...payload, project_id: projectId, sort_order: input.existingCount })
        .select<Technology>("*")
        .maybeSingle();

  if (error) return { technology: null, error: gameEngineHint(error.message) };
  // An update scoped by `id AND project_id` that matched nothing (wrong
  // project, or RLS) must not look like success.
  if (!data) return { technology: null, error: "This technology could not be found in this project." };

  revalidatePath(`/projects/${projectId}/technology`);
  return { technology: data, error: null };
}

export async function deleteTechnology(
  projectId: string,
  technologyId: string
): Promise<TechnologyMutationResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change the stack." };
  }

  const { data, error } = await dataClient(access.userId)
    .from("technologies")
    .delete()
    .eq("id", technologyId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) {
    return { error: "This technology no longer exists, or you're not allowed to remove it." };
  }

  revalidatePath(`/projects/${projectId}/technology`);
  return { error: null };
}
