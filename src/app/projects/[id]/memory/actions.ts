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

// ============================================================
// FACT VS AI INSIGHT REVIEW (TODO.md §20)
//
// A `project_memory` row is a "pending insight" when
// memory_type === 'ai_insight' AND verified === false. It stops being
// pending through exactly one of these three actions — never automatically,
// per §20: "AI-generated information should NOT automatically become
// trusted project truth."
// ============================================================

/**
 * Accept as-is: the insight's own content becomes the fact's content.
 * Mirrors project_memory_update (001): owner/admin/developer — same tier as
 * updateMemory above (verified by reading the policy, not assumed).
 */
export async function acceptInsight(
  projectId: string,
  memoryId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to review insights." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_memory")
    .update({
      memory_type: "fact",
      verified: true,
      verified_by: access.userId,
      verified_at: new Date().toISOString(),
    })
    .eq("id", memoryId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

/**
 * Correct then accept: same effect as acceptInsight, but the reviewer
 * rewrites `content` first. One submit, one Server Action call, so it reads
 * as atomic even though it is a single UPDATE (content + verification
 * fields together, not two separate writes).
 */
export async function correctAndAcceptInsight(
  projectId: string,
  memoryId: string,
  _prevState: MemoryFormState,
  formData: FormData
): Promise<MemoryFormState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to review insights." };
  }

  const content = formData.get("content");
  if (typeof content !== "string" || content.trim().length === 0) {
    return { error: "Content is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_memory")
    .update({
      content: content.trim(),
      memory_type: "fact",
      verified: true,
      verified_by: access.userId,
      verified_at: new Date().toISOString(),
    })
    .eq("id", memoryId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

/**
 * Reject: deletes the row outright. Mirrors project_memory_delete (001):
 * owner/admin only, same tier as deleteMemory above. No confirmation
 * dialog — this codebase doesn't add one for single-row deletes elsewhere
 * (MemoryCardMenu's delete above is the same direct action).
 */
export async function rejectInsight(
  projectId: string,
  memoryId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to reject insights." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_memory").delete().eq("id", memoryId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}
