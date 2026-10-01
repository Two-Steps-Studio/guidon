"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { AUTHORABLE_TYPES } from "./source-config";
import { isSafeHttpUrl } from "@/lib/validation/url";
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

  const trimmedUrl = typeof url === "string" ? url.trim() : "";
  // knowledge-list.tsx / context-tabs.tsx (Context tab renders the same
  // context_sources rows) both render this straight into an <a href> for
  // every project member - see lib/validation/url.ts's own comment.
  if (trimmedUrl && !isSafeHttpUrl(trimmedUrl)) {
    return { error: "Link must be a valid http(s) URL." } as const;
  }

  return {
    error: null,
    type: type as SourceType,
    title: title.trim(),
    content: typeof content === "string" && content.trim() ? content.trim() : null,
    url: trimmedUrl || null,
  } as const;
}

// Mirrors context_sources_insert/update (001): owner/admin/developer; delete: owner/admin only.

const NOT_IN_PROJECT = "This knowledge entry does not belong to this project.";

function revalidateKnowledgeViews(projectId: string) {
  revalidatePath(`/projects/${projectId}/knowledge`);
  revalidatePath(`/projects/${projectId}/context`);
}

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

  const { data, error } = await dataClient(access.userId)
    .from("context_sources")
    .insert({
      project_id: projectId,
      source_type: parsed.type,
      title: parsed.title,
      content: parsed.content,
      url: parsed.url,
      author: access.userId,
    })
    .select<{ id: string }>("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to add knowledge entry." };

  await logActivity({
    userId: access.userId,
    action: "source_created",
    projectId,
    entityType: "source",
    entityId: data.id,
    details: { title: parsed.title },
  });

  revalidateKnowledgeViews(projectId);
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

  // project_id scoping plus a row-count check - a sourceId from a different
  // project (or one RLS filtered) must not "succeed" with zero rows.
  const { data, error } = await dataClient(access.userId)
    .from("context_sources")
    .update({ source_type: parsed.type, title: parsed.title, content: parsed.content, url: parsed.url })
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) return { error: NOT_IN_PROJECT };

  await logActivity({
    userId: access.userId,
    action: "source_updated",
    projectId,
    entityType: "source",
    entityId: sourceId,
    details: { title: parsed.title },
  });

  revalidateKnowledgeViews(projectId);
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

  const { data, error } = await dataClient(access.userId)
    .from("context_sources")
    .delete()
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) return { error: NOT_IN_PROJECT };

  revalidateKnowledgeViews(projectId);
  return { error: null };
}
