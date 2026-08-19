"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { activeAIProviderName, getAIProvider } from "@/lib/ai/provider";
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

// ============================================================
// AI-GENERATED INSIGHT (TODO.md §6/§7 AIProvider, first real caller)
//
// src/lib/ai/provider.ts was built with exactly this feature named as the
// reason it exists, but nothing called getAIProvider() until now — every
// other reference was the health check constructing (never completing) a
// provider. This is the first request that actually spends tokens.
// ============================================================

interface MemoryContentRow {
  content: string;
}

interface DecisionSummaryRow {
  title: string;
  description: string | null;
}

/**
 * Assembles the same kind of project-wide context agent-context.ts builds
 * for an external agent, but scoped to what's useful for a one-shot
 * synthesis prompt: recent verified facts, constraints/rules, and recent
 * decisions. Capped at 20/20/10 rows — this is a prompt, not an export, and
 * an unbounded context would just get truncated by the model anyway.
 */
async function gatherInsightContext(
  projectId: string,
  userId: string
): Promise<{ facts: MemoryContentRow[]; constraints: MemoryContentRow[]; decisions: DecisionSummaryRow[] }> {
  if (hasDirectDatabase()) {
    const [facts, constraints, decisions] = await withUser(userId, ({ query }) =>
      Promise.all([
        query(
          `SELECT content FROM project_memory
           WHERE project_id = $1 AND memory_type = 'fact' AND verified = true
           ORDER BY created_at DESC LIMIT 20`,
          [projectId]
        ).then((result) => result.rows),
        query(
          `SELECT content FROM project_memory
           WHERE project_id = $1 AND memory_type IN ('constraint', 'project_rule')
           ORDER BY created_at DESC LIMIT 20`,
          [projectId]
        ).then((result) => result.rows),
        query(
          `SELECT title, description FROM context_decisions
           WHERE project_id = $1
           ORDER BY created_at DESC LIMIT 10`,
          [projectId]
        ).then((result) => result.rows),
      ])
    );
    return { facts, constraints, decisions };
  }

  const supabase = await createClient();
  const [factsRes, constraintsRes, decisionsRes] = await Promise.all([
    supabase
      .from("project_memory")
      .select("content")
      .eq("project_id", projectId)
      .eq("memory_type", "fact")
      .eq("verified", true)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("project_memory")
      .select("content")
      .eq("project_id", projectId)
      .in("memory_type", ["constraint", "project_rule"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("context_decisions")
      .select("title, description")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    facts: (factsRes.data ?? []) as MemoryContentRow[],
    constraints: (constraintsRes.data ?? []) as MemoryContentRow[],
    decisions: (decisionsRes.data ?? []) as DecisionSummaryRow[],
  };
}

export async function generateInsight(projectId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);

  // Same tier as createMemory — generating an insight is a write.
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to generate insights." };
  }

  if (!activeAIProviderName()) {
    return { error: "No AI provider is configured for this instance." };
  }

  const { facts, constraints, decisions } = await gatherInsightContext(projectId, access.userId);

  if (facts.length === 0 && constraints.length === 0 && decisions.length === 0) {
    return {
      error: "Not enough project memory yet to generate an insight — add some facts or decisions first.",
    };
  }

  const contextBlock = [
    facts.length > 0
      ? `Verified facts:\n${facts.map((row) => `- ${row.content}`).join("\n")}`
      : null,
    constraints.length > 0
      ? `Constraints/rules:\n${constraints.map((row) => `- ${row.content}`).join("\n")}`
      : null,
    decisions.length > 0
      ? `Recent decisions:\n${decisions
          .map((row) => `- ${row.title}${row.description ? `: ${row.description}` : ""}`)
          .join("\n")}`
      : null,
  ]
    .filter((block): block is string => block !== null)
    .join("\n\n");

  let text: string;
  try {
    const provider = await getAIProvider();
    const result = await provider.complete({
      system:
        "You are reviewing a software project's recorded facts, constraints, and decisions. " +
        "Point out ONE specific, non-obvious risk, gap, tension, or connection worth the team's " +
        "attention. Reference the specific facts or decisions involved. Two to three sentences. " +
        "Do not restate the facts back, and do not give generic project-management advice.",
      messages: [{ role: "user", content: contextBlock }],
      maxTokens: 300,
    });
    text = result.text.trim();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate insight." };
  }

  if (!text) {
    return { error: "The AI provider returned an empty response." };
  }

  // Unverified ai_insight, same as one created by hand — goes through the
  // Accept/Correct/Reject review above (TODO.md §20). Nothing about coming
  // from generateInsight() instead of the create-memory form skips that gate.
  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO project_memory (project_id, content, memory_type, verified, created_by)
           VALUES ($1, $2, 'ai_insight', false, $3)`,
          [projectId, text, access.userId]
        )
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to save the generated insight." };
    }

    revalidatePath(`/projects/${projectId}/memory`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_memory").insert({
    project_id: projectId,
    content: text,
    memory_type: "ai_insight",
    verified: false,
    created_by: access.userId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}
