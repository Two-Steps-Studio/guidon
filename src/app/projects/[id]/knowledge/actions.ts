"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { AUTHORABLE_TYPES } from "./source-config";
import type { SourceType } from "@/types/context";

export type SourceFormState = { error: string | null };
export type DeleteSourceResult = { error: string | null };

const VALID_TYPES = AUTHORABLE_TYPES.map((item) => item.value);

function parseSourceForm(formData: FormData) {
  const type = formData.get("type");
  const title = formData.get("title");
  const content = formData.get("content");
  const url = formData.get("url");

  if (typeof type !== "string" || !VALID_TYPES.includes(type as SourceType)) {
    return { error: "Invalid type." } as const;
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return { error: "Title is required." } as const;
  }

  return {
    error: null,
    type: type as SourceType,
    title: title.trim(),
    content: typeof content === "string" && content.trim() ? content.trim() : null,
    url: typeof url === "string" && url.trim() ? url.trim() : null,
  } as const;
}

// Mirrors context_sources_insert/update (001): owner/admin/developer; delete: owner/admin only.

export async function createSource(
  projectId: string,
  _prevState: SourceFormState,
  formData: FormData
): Promise<SourceFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to add knowledge entries." };
  }

  const parsed = parseSourceForm(formData);
  if (parsed.error) return { error: parsed.error };

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO context_sources (project_id, source_type, title, content, url, author)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [projectId, parsed.type, parsed.title, parsed.content, parsed.url, access.userId]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to add knowledge entry." };
    }

    revalidatePath(`/projects/${projectId}/knowledge`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("context_sources").insert({
    project_id: projectId,
    source_type: parsed.type,
    title: parsed.title,
    content: parsed.content,
    url: parsed.url,
    author: access.userId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/knowledge`);
  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}

export async function updateSource(
  projectId: string,
  sourceId: string,
  _prevState: SourceFormState,
  formData: FormData
): Promise<SourceFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to edit knowledge entries." };
  }

  const parsed = parseSourceForm(formData);
  if (parsed.error) return { error: parsed.error };

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          "UPDATE context_sources SET source_type = $1, title = $2, content = $3, url = $4 WHERE id = $5",
          [parsed.type, parsed.title, parsed.content, parsed.url, sourceId]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update knowledge entry." };
    }

    revalidatePath(`/projects/${projectId}/knowledge`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("context_sources")
    .update({
      source_type: parsed.type,
      title: parsed.title,
      content: parsed.content,
      url: parsed.url,
    })
    .eq("id", sourceId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/knowledge`);
  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}

export async function deleteSource(
  projectId: string,
  sourceId: string
): Promise<DeleteSourceResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete knowledge entries." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM context_sources WHERE id = $1", [sourceId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete knowledge entry." };
    }

    revalidatePath(`/projects/${projectId}/knowledge`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("context_sources").delete().eq("id", sourceId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/knowledge`);
  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}
