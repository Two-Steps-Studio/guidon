"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import type { ContextSource, SourceType } from "@/types/context";

export type CreateSourceResult = { source: ContextSource | null; error: string | null };
export type DeleteSourceResult = { error: string | null };

// Mirrors context_sources_insert (001): owner/admin/developer; delete: owner/admin only.

export async function createSource(
  projectId: string,
  input: { type: SourceType; title: string; content: string; url: string }
): Promise<CreateSourceResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { source: null, error: "You do not have permission to add knowledge entries." };
  }
  if (!input.title.trim()) {
    return { source: null, error: "Title is required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("context_sources")
    .insert({
      project_id: projectId,
      source_type: input.type,
      title: input.title.trim() || null,
      content: input.content.trim() || null,
      url: input.url.trim() || null,
      author: access.userId,
    })
    .select()
    .single();

  if (error) return { source: null, error: error.message };

  revalidatePath(`/projects/${projectId}/knowledge`);
  return { source: data as ContextSource, error: null };
}

export async function deleteSource(
  projectId: string,
  sourceId: string
): Promise<DeleteSourceResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete knowledge entries." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("context_sources").delete().eq("id", sourceId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/knowledge`);
  return { error: null };
}
