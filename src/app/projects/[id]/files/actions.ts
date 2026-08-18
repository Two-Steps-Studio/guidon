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

export async function deleteFile(
  projectId: string,
  fileId: string,
  storagePath: string | null
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);

  // Mirrors project_files_delete (001): owner/admin only.
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete files." };
  }

  try {
    if (storagePath) {
      await deleteProjectFile(storagePath);
    }

    const supabase = await createClient();
    const { error } = await supabase.from("project_files").delete().eq("id", fileId);
    if (error) return { error: error.message };
  } catch (deleteError) {
    return { error: deleteError instanceof Error ? deleteError.message : "Delete failed." };
  }

  revalidatePath(`/projects/${projectId}/files`);
  return { error: null };
}

/**
 * Provider-agnostic download link: works whether the bucket is Supabase
 * Storage or the local filesystem (which the browser cannot reach directly).
 */
export async function getDownloadUrl(
  projectId: string,
  storagePath: string
): Promise<{ url: string | null; error: string | null }> {
  const access = await getProjectAccess(projectId);

  if (!access) {
    return { url: null, error: "You do not have access to this project." };
  }

  try {
    const url = await getSignedUrl(STORAGE_BUCKETS.FILES, storagePath);
    return { url, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Failed to create download link." };
  }
}
