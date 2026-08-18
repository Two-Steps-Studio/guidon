"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import type { MemoryType } from "@/types/context";

export type MemoryFormState = {
  error: string | null;
};

const VALID_TYPES: MemoryType[] = [
  "fact",
  "project_rule",
  "constraint",
  "preference",
  "decision_summary",
  "observation",
  "ai_insight",
];

type ParsedMemoryForm =
  | { error: string; content?: undefined; memoryType?: undefined }
  | { error: null; content: string; memoryType: MemoryType };

function parseMemoryForm(formData: FormData): ParsedMemoryForm {
  const content = formData.get("content");
  const memoryType = formData.get("memory_type");

  if (typeof content !== "string" || content.trim().length === 0) {
    return { error: "Content is required." };
  }
  if (typeof memoryType !== "string" || !VALID_TYPES.includes(memoryType as MemoryType)) {
    return { error: "Invalid memory type." };
  }

  return { error: null, content: content.trim(), memoryType: memoryType as MemoryType };
}

export async function createMemory(
  projectId: string,
  _prevState: MemoryFormState,
  formData: FormData
): Promise<MemoryFormState> {
  const access = await getProjectAccess(projectId);

  // Mirrors project_memory_insert (001): owner/admin/developer only.
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to add memory entries." };
  }

  const parsed = parseMemoryForm(formData);
  if (parsed.error) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("project_memory").insert({
    project_id: projectId,
    content: parsed.content,
    memory_type: parsed.memoryType,
    created_by: access.userId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

export async function updateMemory(
  projectId: string,
  memoryId: string,
  _prevState: MemoryFormState,
  formData: FormData
): Promise<MemoryFormState> {
  const access = await getProjectAccess(projectId);

  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to edit memory entries." };
  }

  const parsed = parseMemoryForm(formData);
  if (parsed.error) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_memory")
    .update({ content: parsed.content, memory_type: parsed.memoryType })
    .eq("id", memoryId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

export async function deleteMemory(
  projectId: string,
  memoryId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);

  // Mirrors project_memory_delete (001): owner/admin only.
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to delete memory entries." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_memory").delete().eq("id", memoryId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}
