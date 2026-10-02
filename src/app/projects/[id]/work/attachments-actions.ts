"use server";

import { revalidatePath } from "next/cache";
import { canCommentOnProject, canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import {
  deleteTaskAttachment as deleteStoredAttachment,
  getOrganizationStorageUsage,
  getSignedUrl,
  uploadTaskAttachment as uploadStoredAttachment,
} from "@/lib/storage/storage";
import { STORAGE_BUCKETS } from "@/lib/storage/storage-constants";
import { getOrgPlanLimits, isStorageLimitReached } from "@/lib/limits";

export type TaskAttachment = {
  id: string;
  task_id: string;
  name: string;
  size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

const ATTACHMENT_COLUMNS = "id, task_id, name, size_bytes, mime_type, uploaded_by, created_at";

export async function loadTaskAttachments(
  projectId: string,
  taskId: string
): Promise<{ attachments: TaskAttachment[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { attachments: [], error: "You do not have access to this project." };

  const { data, error } = await dataClient(access.userId)
    .from<TaskAttachment>("task_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return { attachments: [], error: error.message };
  return { attachments: (data ?? []) as TaskAttachment[], error: null };
}

/**
 * File bytes travel through the Server Action body, same reasoning as
 * files/actions.ts's uploadFile: the browser cannot write to local-disk
 * storage directly, only the server can. next.config.ts's Server Action
 * body limit (30MB) already covers this.
 */
export async function uploadTaskAttachment(
  projectId: string,
  taskId: string,
  formData: FormData
): Promise<{ attachment: TaskAttachment | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  // Mirrors task_attachments_insert (041): owner/admin/developer/tester -
  // the same tier as commenting on a task.
  if (!access || !canCommentOnProject(access.role)) {
    return { attachment: null, error: "You do not have permission to attach files to this task." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { attachment: null, error: "No file selected." };
  }

  if (!hasDirectDatabase()) {
    const { planName, storageLimitBytes } = await getOrgPlanLimits(access.project.organization_id);
    const currentUsage = await getOrganizationStorageUsage(access.project.organization_id);

    if (isStorageLimitReached(currentUsage + file.size, storageLimitBytes)) {
      return {
        attachment: null,
        error: `This upload would exceed your ${planName} plan's storage limit. Upgrade your plan to raise this limit.`,
      };
    }
  }

  let uploaded: { path: string };
  try {
    uploaded = await uploadStoredAttachment(projectId, taskId, file, access.userId);
  } catch (uploadError) {
    return { attachment: null, error: uploadError instanceof Error ? uploadError.message : "Upload failed." };
  }

  const { data: attachment, error: insertError } = await dataClient(access.userId)
    .from("task_attachments")
    .insert({
      task_id: taskId,
      name: file.name,
      storage_path: uploaded.path,
      size_bytes: file.size,
      mime_type: file.type || "application/octet-stream",
      uploaded_by: access.userId,
    })
    .select<TaskAttachment>(ATTACHMENT_COLUMNS)
    .single();

  if (insertError || !attachment) {
    return { attachment: null, error: insertError?.message ?? "Failed to save attachment." };
  }

  await logActivity({
    userId: access.userId,
    action: "task_attachment_uploaded",
    projectId,
    entityType: "task",
    entityId: taskId,
    details: { name: file.name },
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { attachment, error: null };
}

/**
 * Scoped by `id AND task_id`, storage_path taken only from the deleted
 * row's own RETURNING/select - never a client-supplied path. Same fix
 * class files/actions.ts's deleteFile documents (TODO.md §29): a caller
 * could otherwise delete or read any attachment in the whole instance by
 * guessing/reusing an id, independent of which task they actually manage.
 */
export async function deleteTaskAttachment(
  projectId: string,
  taskId: string,
  attachmentId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { error: "You do not have permission to delete this attachment." };

  const { data: deleted, error: deleteError } = await dataClient(access.userId)
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("task_id", taskId)
    .select<{ storage_path: string }>("storage_path")
    .maybeSingle();

  if (deleteError) return { error: deleteError.message };
  if (!deleted) return { error: "Attachment not found, or you do not have permission to delete it." };
  const storagePath = deleted.storage_path;

  try {
    if (storagePath) await deleteStoredAttachment(storagePath);
  } catch (deleteError) {
    return { error: deleteError instanceof Error ? deleteError.message : "Delete failed." };
  }

  await logActivity({
    userId: access.userId,
    action: "task_attachment_deleted",
    projectId,
    entityType: "task",
    entityId: taskId,
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}

/**
 * Provider-agnostic download link, same reasoning as files/actions.ts's
 * getDownloadUrl: works whether the bucket is Supabase Storage or the
 * local filesystem (which the browser cannot reach directly). Takes
 * attachmentId, not a raw storagePath, and looks the path up scoped to
 * task_id - see deleteTaskAttachment's own comment for why.
 */
export async function getTaskAttachmentDownloadUrl(
  projectId: string,
  taskId: string,
  attachmentId: string
): Promise<{ url: string | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { url: null, error: "You do not have access to this project." };

  const { data: found, error: lookupError } = await dataClient(access.userId)
    .from("task_attachments")
    .select<{ storage_path: string }>("storage_path")
    .eq("id", attachmentId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (lookupError) return { url: null, error: lookupError.message };
  const storagePath = found?.storage_path ?? null;

  if (!storagePath) return { url: null, error: "Attachment not found in this task." };

  try {
    const url = await getSignedUrl(STORAGE_BUCKETS.ATTACHMENTS, storagePath);
    return { url, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Failed to create download link." };
  }
}

// canManageProject is re-exported for the UI's delete-button gating (owner/admin can delete any attachment; the uploader can delete their own regardless of role - see task_attachments_delete's RLS policy).
export { canManageProject };

/**
 * Signed URLs for every image attachment on a task, in one round trip -
 * the task dialog's gallery and inline `attachment:` images in the
 * description/comments need all of them at once, and one Server Action per
 * image (getTaskAttachmentDownloadUrl) meant N sequential-ish requests on
 * every dialog open.
 */
export async function getTaskAttachmentImageUrls(
  projectId: string,
  taskId: string
): Promise<{ urls: Record<string, string>; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { urls: {}, error: "You do not have access to this project." };

  const { data: rows, error } = await dataClient(access.userId)
    .from("task_attachments")
    .select<{ id: string; storage_path: string }>("id, storage_path")
    .eq("task_id", taskId)
    .like("mime_type", "image/%");
  if (error) return { urls: {}, error: error.message };

  const entries = await Promise.all(
    rows.map(async (row) => {
      try {
        return [row.id, await getSignedUrl(STORAGE_BUCKETS.ATTACHMENTS, row.storage_path)] as const;
      } catch {
        return null;
      }
    })
  );

  const urls: Record<string, string> = {};
  for (const entry of entries) if (entry) urls[entry[0]] = entry[1];
  return { urls, error: null };
}
