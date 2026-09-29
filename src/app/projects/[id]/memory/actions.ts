"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { resolveAIProvider } from "@/lib/ai/resolve-provider";
import { isInsightRateLimited, recordInsightGeneration } from "@/lib/ai/insight-rate-limit";
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

  const { data, error } = await dataClient(access.userId)
    .from("project_memory")
    .insert({
      project_id: projectId,
      content: parsed.content,
      memory_type: parsed.memoryType,
      created_by: access.userId,
    })
    .select<{ id: string }>("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to add memory entry." };

  await logActivity({
    userId: access.userId,
    action: "memory_created",
    projectId,
    entityType: "memory",
    entityId: data.id,
  });

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

/**
 * UPDATE one memory row scoped by `id AND project_id`, treating zero
 * affected rows (a memoryId from another project, or one RLS filtered) as
 * an error instead of silent success - see updateDecision
 * (decisions/actions.ts) for the full story.
 */
async function updateMemoryRow(
  userId: string,
  projectId: string,
  memoryId: string,
  patch: Record<string, unknown>,
  notFound: string
): Promise<string | null> {
  const { data, error } = await dataClient(userId)
    .from("project_memory")
    .update(patch)
    .eq("id", memoryId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return error.message;
  return data.length === 0 ? notFound : null;
}

/** DELETE counterpart of updateMemoryRow. */
async function deleteMemoryRow(
  userId: string,
  projectId: string,
  memoryId: string,
  notFound: string
): Promise<string | null> {
  const { data, error } = await dataClient(userId)
    .from("project_memory")
    .delete()
    .eq("id", memoryId)
    .eq("project_id", projectId)
    .select("id");
  if (error) return error.message;
  return data.length === 0 ? notFound : null;
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

  const error = await updateMemoryRow(
    access.userId,
    projectId,
    memoryId,
    { content: parsed.content, memory_type: parsed.memoryType },
    "This memory entry does not belong to this project."
  );
  if (error) return { error };

  await logActivity({
    userId: access.userId,
    action: "memory_updated",
    projectId,
    entityType: "memory",
    entityId: memoryId,
  });

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

  const error = await deleteMemoryRow(
    access.userId,
    projectId,
    memoryId,
    "This memory entry does not belong to this project."
  );
  if (error) return { error };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

// ============================================================
// FACT VS AI INSIGHT REVIEW (TODO.md §20)
//
// A `project_memory` row is a "pending insight" when
// memory_type === 'ai_insight' AND verified === false. It stops being
// pending through exactly one of these three actions - never automatically,
// per §20: "AI-generated information should NOT automatically become
// trusted project truth."
// ============================================================

const INSIGHT_NOT_FOUND = "This insight does not belong to this project.";

/**
 * Turns an insight into a verified fact - with the reviewer's rewritten
 * content when given - in one UPDATE (content + verification fields
 * together, not two separate writes). Mirrors project_memory_update (001):
 * owner/admin/developer, same tier as updateMemory.
 */
async function verifyInsight(projectId: string, memoryId: string, content: string | null): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to review insights." };
  }

  const error = await updateMemoryRow(
    access.userId,
    projectId,
    memoryId,
    {
      ...(content !== null ? { content } : {}),
      memory_type: "fact",
      verified: true,
      verified_by: access.userId,
      verified_at: new Date().toISOString(),
    },
    INSIGHT_NOT_FOUND
  );
  if (error) return { error };

  await logActivity({
    userId: access.userId,
    action: "memory_verified",
    projectId,
    entityType: "memory",
    entityId: memoryId,
  });

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

/** Accept as-is: the insight's own content becomes the fact's content. */
export async function acceptInsight(
  projectId: string,
  memoryId: string
): Promise<{ error: string | null }> {
  return verifyInsight(projectId, memoryId, null);
}

/** Correct then accept: same as acceptInsight, but the reviewer rewrites `content` first. */
export async function correctAndAcceptInsight(
  projectId: string,
  memoryId: string,
  _prevState: MemoryFormState,
  formData: FormData
): Promise<MemoryFormState> {
  const content = formData.get("content");
  if (typeof content !== "string" || content.trim().length === 0) {
    return { error: "Content is required." };
  }
  return verifyInsight(projectId, memoryId, content.trim());
}

/**
 * Reject: deletes the row outright. Mirrors project_memory_delete (001):
 * owner/admin only, same tier as deleteMemory above. No confirmation
 * dialog - this codebase doesn't add one for single-row deletes elsewhere
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

  const error = await deleteMemoryRow(access.userId, projectId, memoryId, INSIGHT_NOT_FOUND);
  if (error) return { error };

  revalidatePath(`/projects/${projectId}/memory`);
  return { error: null };
}

// ============================================================
// AI-GENERATED INSIGHT (TODO.md §6/§7 AIProvider, first real caller)
//
// src/lib/ai/provider.ts was built with exactly this feature named as the
// reason it exists, but nothing called getAIProvider() until now - every
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
 * decisions. Capped at 20/20/10 rows - this is a prompt, not an export, and
 * an unbounded context would just get truncated by the model anyway.
 */
async function gatherInsightContext(
  projectId: string,
  userId: string
): Promise<{ facts: MemoryContentRow[]; constraints: MemoryContentRow[]; decisions: DecisionSummaryRow[] }> {
  const db = dataClient(userId);
  const [factsRes, constraintsRes, decisionsRes] = await Promise.all([
    db
      .from<MemoryContentRow>("project_memory")
      .select("content")
      .eq("project_id", projectId)
      .eq("memory_type", "fact")
      .eq("verified", true)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from<MemoryContentRow>("project_memory")
      .select("content")
      .eq("project_id", projectId)
      .in("memory_type", ["constraint", "project_rule"])
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from<DecisionSummaryRow>("context_decisions")
      .select("title, description")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return { facts: factsRes.data, constraints: constraintsRes.data, decisions: decisionsRes.data };
}

export async function generateInsight(projectId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);

  // Same tier as createMemory - generating an insight is a write.
  if (!access || !canWriteProject(access.role)) {
    return { error: "You do not have permission to generate insights." };
  }

  // The button is hidden when AI is switched off for the project (migration
  // 046), but a stale page or a direct action call could still get here.
  if (!access.project.ai_enabled) {
    return { error: "AI features are turned off for this project." };
  }

  const provider = await resolveAIProvider(access.project.organization_id, access.userId);
  if (!provider) {
    return { error: "No AI provider is configured for this organization." };
  }

  if (isInsightRateLimited(access.userId, projectId)) {
    return { error: "You're generating insights too quickly - wait a few minutes and try again." };
  }

  const { facts, constraints, decisions } = await gatherInsightContext(projectId, access.userId);

  if (facts.length === 0 && constraints.length === 0 && decisions.length === 0) {
    return {
      error: "Not enough project memory yet to generate an insight - add some facts or decisions first.",
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

  recordInsightGeneration(access.userId, projectId);

  let text: string;
  try {
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

  // Unverified ai_insight, same as one created by hand - goes through the
  // Accept/Correct/Reject review above (TODO.md §20). Nothing about coming
  // from generateInsight() instead of the create-memory form skips that gate.
  const { error } = await dataClient(access.userId).from("project_memory").insert({
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
