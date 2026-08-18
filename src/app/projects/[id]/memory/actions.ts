"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO project_memory (project_id, content, memory_type, created_by)
           VALUES ($1, $2, $3, $4)`,
          [projectId, parsed.content, parsed.memoryType, access.userId]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to add memory entry." };
    }

    revalidatePath(`/projects/${projectId}/memory`);
    return { error: null };
  }

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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("UPDATE project_memory SET content = $1, memory_type = $2 WHERE id = $3", [
          parsed.content,
          parsed.memoryType,
          memoryId,
        ])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update memory entry." };
    }

    revalidatePath(`/projects/${projectId}/memory`);
    return { error: null };
  }

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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM project_memory WHERE id = $1", [memoryId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to delete memory entry." };
    }

    revalidatePath(`/projects/${projectId}/memory`);
    return { error: null };
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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          `UPDATE project_memory
           SET memory_type = 'fact', verified = true, verified_by = $1, verified_at = now()
           WHERE id = $2`,
          [access.userId, memoryId]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to accept insight." };
    }

    revalidatePath(`/projects/${projectId}/memory`);
    return { error: null };
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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          `UPDATE project_memory
           SET content = $1, memory_type = 'fact', verified = true, verified_by = $2, verified_at = now()
           WHERE id = $3`,
          [content.trim(), access.userId, memoryId]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to accept insight." };
    }

    revalidatePath(`/projects/${projectId}/memory`);
    return { error: null };
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

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM project_memory WHERE id = $1", [memoryId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to reject insight." };
    }

    revalidatePath(`/projects/${projectId}/memory`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_memory").delete().eq("id", memoryId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}
