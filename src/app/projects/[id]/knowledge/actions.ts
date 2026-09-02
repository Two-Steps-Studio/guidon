"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
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
    let sourceId: string;

    try {
      sourceId = await withUser(access.userId, async ({ query }) => {
        const result = await query(
          `INSERT INTO context_sources (project_id, source_type, title, content, url, author)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [projectId, parsed.type, parsed.title, parsed.content, parsed.url, access.userId]
        );
        return result.rows[0].id as string;
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to add knowledge entry." };
    }

    await logActivity({
      userId: access.userId,
      action: "source_created",
      projectId,
      entityType: "source",
      entityId: sourceId,
      details: { title: parsed.title },
    });

    revalidatePath(`/projects/${projectId}/knowledge`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("context_sources")
    .insert({
      project_id: projectId,
      source_type: parsed.type,
      title: parsed.title,
      content: parsed.content,
      url: parsed.url,
      author: access.userId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  await logActivity({
    userId: access.userId,
    action: "source_created",
    projectId,
    entityType: "source",
    entityId: data.id,
    details: { title: parsed.title },
  });

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
      // project_id scoping plus a RETURNING/row-count check - same pattern
      // applied to decisions/memory in a previous audit round: without it, a
      // sourceId from a different project silently "succeeds" with zero
      // rows affected instead of returning an error.
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `UPDATE context_sources SET source_type = $1, title = $2, content = $3, url = $4
           WHERE id = $5 AND project_id = $6
           RETURNING id`,
          [parsed.type, parsed.title, parsed.content, parsed.url, sourceId, projectId]
        )
      );
      if (result.rows.length === 0) {
        return { error: "This knowledge entry does not belong to this project." };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update knowledge entry." };
    }

    await logActivity({
      userId: access.userId,
      action: "source_updated",
      projectId,
      entityType: "source",
      entityId: sourceId,
      details: { title: parsed.title },
    });

    revalidatePath(`/projects/${projectId}/knowledge`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("context_sources")
    .update({
      source_type: parsed.type,
      title: parsed.title,
      content: parsed.content,
      url: parsed.url,
    })
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This knowledge entry does not belong to this project." };
  }

  await logActivity({
    userId: access.userId,
    action: "source_updated",
    projectId,
    entityType: "source",
    entityId: sourceId,
    details: { title: parsed.title },
  });

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
      const result = await withUser(access.userId, ({ query }) =>
        query("DELETE FROM context_sources WHERE id = $1 AND project_id = $2 RETURNING id", [
          sourceId,
          projectId,
        ])
      );
      if (result.rows.length === 0) {
        return { error: "This knowledge entry does not belong to this project." };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete knowledge entry." };
    }

    revalidatePath(`/projects/${projectId}/knowledge`);
    revalidatePath(`/projects/${projectId}/context`);
    return { error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("context_sources")
    .delete()
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This knowledge entry does not belong to this project." };
  }

  revalidatePath(`/projects/${projectId}/knowledge`);
  revalidatePath(`/projects/${projectId}/context`);
  return { error: null };
}
