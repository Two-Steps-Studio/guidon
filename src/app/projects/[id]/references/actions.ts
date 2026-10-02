"use server";

import { revalidatePath } from "next/cache";
import { canCommentOnProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { logActivity } from "@/lib/data/log-activity";
import {
  deleteProjectFile as deleteStoredFile,
  getOrganizationStorageUsage,
  getSignedUrl,
  uploadProjectReference as uploadStoredReference,
} from "@/lib/storage/storage";
import { STORAGE_BUCKETS } from "@/lib/storage/storage-constants";
import { getOrgPlanLimits, isStorageLimitReached } from "@/lib/limits";

/** A moodboard image (project_references, migration 048) plus a signed URL to show it. */
export type ProjectReference = {
  id: string;
  name: string;
  size_bytes: number | null;
  mime_type: string;
  caption: string | null;
  tags: string[];
  source_url: string | null;
  uploaded_by: string | null;
  created_at: string;
  url: string | null;
};

const COLUMNS = "id, name, storage_path, size_bytes, mime_type, caption, tags, source_url, uploaded_by, created_at";

type Row = Omit<ProjectReference, "url"> & { storage_path: string };

async function withUrl(row: Row): Promise<ProjectReference> {
  const { storage_path, ...rest } = row;
  let url: string | null = null;
  try {
    url = await getSignedUrl(STORAGE_BUCKETS.FILES, storage_path);
  } catch {
    url = null;
  }
  return { ...rest, tags: rest.tags ?? [], url };
}

/** Tags are free-form but normalized: trimmed, lowercased, de-duplicated, at most 12 of 40 chars. */
function normalizeTags(tags: string[]): string[] {
  const clean = tags.map((tag) => tag.trim().toLowerCase().slice(0, 40)).filter(Boolean);
  return Array.from(new Set(clean)).slice(0, 12);
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    // Rendered as a link - only web URLs, never javascript: or data:.
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function loadReferences(
  projectId: string
): Promise<{ references: ProjectReference[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { references: [], error: "You do not have access to this project." };

  const { data: rows, error } = await dataClient(access.userId)
    .from<Row>("project_references")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return { references: [], error: error.message };

  return { references: await Promise.all(rows.map(withUrl)), error: null };
}

/** Same tier as task attachments (task_attachments_insert, 041): owner/admin/developer/tester. */
export async function uploadReference(
  projectId: string,
  formData: FormData
): Promise<{ reference: ProjectReference | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canCommentOnProject(access.role)) {
    return { reference: null, error: "You do not have permission to add images to this moodboard." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { reference: null, error: "No image selected." };

  const caption = (formData.get("caption") as string | null)?.trim() || null;
  const tags = normalizeTags(((formData.get("tags") as string | null) ?? "").split(","));

  if (!hasDirectDatabase()) {
    const { planName, storageLimitBytes } = await getOrgPlanLimits(access.project.organization_id);
    const currentUsage = await getOrganizationStorageUsage(access.project.organization_id);
    if (isStorageLimitReached(currentUsage + file.size, storageLimitBytes)) {
      return {
        reference: null,
        error: `This upload would exceed your ${planName} plan's storage limit. Upgrade your plan to raise this limit.`,
      };
    }
  }

  let uploaded: { path: string };
  try {
    uploaded = await uploadStoredReference(projectId, file, access.userId);
  } catch (uploadError) {
    return { reference: null, error: uploadError instanceof Error ? uploadError.message : "Upload failed." };
  }

  const { data: row, error: insertError } = await dataClient(access.userId)
    .from("project_references")
    .insert({
      project_id: projectId,
      name: file.name,
      storage_path: uploaded.path,
      size_bytes: file.size,
      mime_type: file.type,
      caption,
      tags,
      uploaded_by: access.userId,
    })
    .select<Row>(COLUMNS)
    .single();

  if (insertError || !row) {
    // Don't leave an orphaned object in storage when the row couldn't be saved.
    await deleteStoredFile(uploaded.path).catch(() => {});
    return { reference: null, error: insertError?.message ?? "Failed to save the image." };
  }

  await logActivity({
    userId: access.userId,
    action: "reference_added",
    projectId,
    entityType: "project_reference",
    entityId: row.id,
    details: { name: file.name },
  });

  revalidatePath(`/projects/${projectId}/references`);
  return { reference: await withUrl(row), error: null };
}

/**
 * Caption, tags and source link only - the only columns 048's GRANT UPDATE
 * allows. Scoped by `id AND project_id` with a rowcount check: RLS lets the
 * uploader or an owner/admin through and silently matches zero rows for
 * anyone else, which must not come back as success.
 */
export async function updateReference(
  projectId: string,
  referenceId: string,
  input: { caption: string; tags: string[]; sourceUrl: string }
): Promise<{ reference: ProjectReference | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canCommentOnProject(access.role)) {
    return { reference: null, error: "You do not have permission to edit this image." };
  }

  const caption = input.caption.trim() || null;
  const tags = normalizeTags(input.tags);
  const sourceUrl = normalizeUrl(input.sourceUrl);
  if (input.sourceUrl.trim() && !sourceUrl) return { reference: null, error: "The source link must be an http(s) URL." };

  const { data: row, error } = await dataClient(access.userId)
    .from("project_references")
    .update({ caption, tags, source_url: sourceUrl })
    .eq("id", referenceId)
    .eq("project_id", projectId)
    .select<Row>(COLUMNS)
    .maybeSingle();
  if (error) return { reference: null, error: error.message };
  if (!row) return { reference: null, error: "Image not found, or you can only edit images you added." };

  revalidatePath(`/projects/${projectId}/references`);
  return { reference: await withUrl(row), error: null };
}

/** Storage path comes only from the deleted row itself, never from the client (same as deleteTaskAttachment). */
export async function deleteReference(projectId: string, referenceId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { error: "You do not have permission to delete this image." };

  const { data: deleted, error } = await dataClient(access.userId)
    .from("project_references")
    .delete()
    .eq("id", referenceId)
    .eq("project_id", projectId)
    .select<{ storage_path: string }>("storage_path")
    .maybeSingle();
  if (error) return { error: error.message };
  const storagePath = deleted?.storage_path ?? null;

  if (!storagePath) return { error: "Image not found, or you can only delete images you added." };

  try {
    await deleteStoredFile(storagePath);
  } catch (deleteError) {
    return { error: deleteError instanceof Error ? deleteError.message : "Delete failed." };
  }

  await logActivity({
    userId: access.userId,
    action: "reference_deleted",
    projectId,
    entityType: "project_reference",
    entityId: referenceId,
  });

  revalidatePath(`/projects/${projectId}/references`);
  return { error: null };
}
