"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import {
  deleteProjectFile,
  getFileCategoryFromMimeType,
  getSignedUrl,
  uploadProjectFile,
} from "@/lib/storage/storage";
import { STORAGE_BUCKETS } from "@/lib/storage/storage-constants";

export type FileActionState = {
  error: string | null;
};

/**
 * File bytes travel through the Server Action body (not a direct browser ->
 * storage call), which is what makes this work under any storage provider —
 * the browser cannot write to local disk storage directly, only the server
 * can. next.config.ts raises the Server Action body limit to cover this.
 */
export async function uploadFile(
  projectId: string,
  _prevState: FileActionState,
  formData: FormData
): Promise<FileActionState> {
  const access = await getProjectAccess(projectId);

  // Mirrors project_files_insert (001): owner/admin/developer only.
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to upload files." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected." };
  }

  try {
    const category = getFileCategoryFromMimeType(file.type);
    const uploaded = await uploadProjectFile(projectId, file, category, access.userId);

    const supabase = await createClient();
    const { error } = await supabase.from("project_files").insert({
      project_id: projectId,
      name: file.name,
      storage_path: uploaded.path,
      category,
      size_bytes: file.size,
      mime_type: file.type || "application/octet-stream",
      uploaded_by: access.userId,
    });

    if (error) return { error: error.message };
  } catch (uploadError) {
    return { error: uploadError instanceof Error ? uploadError.message : "Upload failed." };
  }

  revalidatePath(`/projects/${projectId}/files`);
  return { error: null };
}

/**
 * `storagePath` used to be a caller-supplied argument, trusted for the
 * actual storage delete without ever being checked against `projectId` —
 * the access check above only verified the caller manages *some* project,
 * not that the path belonged to it. Any project manager could delete any
 * other project's file by passing its (predictable) storage path directly
 * to this Server Action, bypassing the UI entirely. Found in the TODO.md
 * §29 security audit.
 *
 * Fixed by dropping `storagePath` as an argument and instead deleting the
 * `project_files` row scoped to *both* `id` and `project_id` — a mismatched
 * `fileId` now matches zero rows, and the storage object is never touched
 * unless that row-scoped delete actually found one. The row's own
 * `storage_path` (via `.select()` on the delete) is the only path ever
 * passed to `deleteProjectFile()`, so nothing client-supplied reaches
 * storage. DB delete happens first specifically so an unauthorized call
 * never reaches the storage step at all.
 */
export async function deleteFile(
  projectId: string,
  fileId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);

  // Mirrors project_files_delete (001): owner/admin only.
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete files." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_files")
    .delete()
    .eq("id", fileId)
    .eq("project_id", projectId)
    .select("storage_path")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "File not found in this project." };

  try {
    if (data.storage_path) {
      await deleteProjectFile(data.storage_path);
    }
  } catch (deleteError) {
    return { error: deleteError instanceof Error ? deleteError.message : "Delete failed." };
  }

  revalidatePath(`/projects/${projectId}/files`);
  return { error: null };
}

/**
 * Provider-agnostic download link: works whether the bucket is Supabase
 * Storage or the local filesystem (which the browser cannot reach directly).
 *
 * Same fix as deleteFile: takes `fileId`, not a raw `storagePath`, and looks
 * the path up scoped to `project_id` — the access check on `projectId` alone
 * previously let anyone who could see any project mint a signed download URL
 * for an arbitrary storage path in the bucket, since the path was never
 * verified to belong to that project. Found in the TODO.md §29 security
 * audit.
 */
export async function getDownloadUrl(
  projectId: string,
  fileId: string
): Promise<{ url: string | null; error: string | null }> {
  const access = await getProjectAccess(projectId);

  if (!access) {
    return { url: null, error: "You do not have access to this project." };
  }

  const supabase = await createClient();

  const { data, error: lookupError } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (lookupError) return { url: null, error: lookupError.message };
  if (!data?.storage_path) return { url: null, error: "File not found in this project." };

  try {
    const url = await getSignedUrl(STORAGE_BUCKETS.FILES, data.storage_path);
    return { url, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Failed to create download link." };
  }
}
