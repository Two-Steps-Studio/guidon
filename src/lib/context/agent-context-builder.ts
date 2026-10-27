import "server-only";

/**
 * Agent context for one task (Context Engine): the task plus what Guidon
 * knows around it - project constraints and facts, the linked decision and
 * everything reachable through context_relations, previous attempts, and the
 * rest of the project memory - packed within a token budget by
 * src/lib/context/context-pack-core.ts (ranking, freshness, redaction,
 * untrusted-text handling). Used by the task dialog's "Copy agent context",
 * GET /api/v1/tasks/{id}/context and the get_task_context MCP tool.
 *
 * Everything is assembled verbatim from rows the caller can read under RLS;
 * nothing goes through src/lib/ai/*. Per-item attribution (who wrote what)
 * stays out - the Why panel covers that in the UI.
 */

import { dataClient } from "@/lib/data-client";
import { buildTaskWhyContext, type SupabaseClientFactory } from "@/lib/context/task-why-builder";
import { MEMORY_TYPE_CONFIG } from "@/app/projects/[id]/memory/memory-type-config";
import { TYPE_LABELS as SOURCE_TYPE_LABELS } from "@/app/projects/[id]/knowledge/source-config";
import type { MemoryType } from "@/types/context";
import { CONTEXT_TOKEN_DEFAULT, CONTEXT_WEIGHTS as W, neutralize, packContext, type ContextItem, type ContextPackStats } from "@/lib/context/context-pack-core";

export interface TaskAgentContext {
  markdown: string;
  error: string | null;
  stats?: ContextPackStats;
}

export type ContextOptions = { budget?: number; focus?: string; now?: Date };

const FAIL = (error: string): TaskAgentContext => ({ markdown: "", error });

type Stamp = string | Date | null;
const iso = (value: Stamp): string | null => (value ? new Date(value).toISOString() : null);

export interface MemoryRow { id: string; content: string; memory_type: MemoryType; verified: boolean; confidence: number | null; created_at: Stamp; updated_at: Stamp }
export interface DecisionRow { id: string; title: string; status: string; decision_type: string; description: string | null; created_at: Stamp; updated_at: Stamp }
interface FileRow { id: string; name: string; category: string | null; file_url: string | null; created_at: Stamp }
interface SourceRow { id: string; title: string | null; content: string | null; url: string | null; source_type: string; created_at: Stamp; updated_at: Stamp }
export interface AttemptRow { id: string; problem: string; approach: string; outcome: string; result: string | null; failure_reason: string | null; files_changed: string[]; related_pr_url: string | null; agent: string | null; created_at: Stamp }

export const MEMORY_COLUMNS = "id, content, memory_type, verified, confidence, created_at, updated_at";
export const DECISION_COLUMNS = "id, title, status, decision_type, description, created_at, updated_at";
export const ATTEMPT_COLUMNS = "id, problem, approach, outcome, result, failure_reason, files_changed, related_pr_url, agent, created_at";

/** Project memory as context items: constraints/rules timeless, verified facts, AI insights, the rest. */
export function memoryItems(memory: MemoryRow[]): ContextItem[] {
  return memory.map((row): ContextItem => {
    const updatedAt = iso(row.updated_at ?? row.created_at);
    if (row.memory_type === "constraint" || row.memory_type === "project_rule") {
      return { section: "constraints", id: row.id, title: row.content, tags: [MEMORY_TYPE_CONFIG[row.memory_type].label], weight: W.constraint, updatedAt, timeless: true };
    }
    if (row.memory_type === "fact" && row.verified) return { section: "facts", id: row.id, title: row.content, weight: W.verifiedFact, updatedAt };
    if (row.memory_type === "ai_insight") {
      const confidence = row.confidence === null ? "confidence unknown" : `confidence ${Math.round(row.confidence * 100)}%`;
      return { section: "insights", id: row.id, title: row.content, tags: [confidence, row.verified ? "verified" : "unverified"], weight: W.insight + (row.verified ? 10 : 0), updatedAt };
    }
    const label = `${MEMORY_TYPE_CONFIG[row.memory_type].label}${row.memory_type === "fact" ? " (unverified)" : ""}`;
    return { section: "memory", id: row.id, title: row.content, tags: [label], weight: W.memory, updatedAt };
  });
}

export function decisionItem(row: DecisionRow, weight: number, tags: string[] = []): ContextItem {
  return { section: "decisions", id: row.id, title: row.title, tags: [row.decision_type, row.status, ...tags], details: row.description?.trim() ? [row.description] : [], weight, updatedAt: iso(row.updated_at ?? row.created_at) };
}

export function attemptItem(row: AttemptRow): ContextItem {
  const succeeded = row.outcome === "succeeded";
  const details = [
    `Approach: ${row.approach}`,
    ...(row.failure_reason?.trim() ? [`Why it failed: ${row.failure_reason}`] : []),
    ...(row.result?.trim() ? [`Result: ${row.result}`] : []),
    ...(row.files_changed?.length ? [`Files: ${row.files_changed.join(", ")}`] : []),
    ...(row.related_pr_url?.trim() ? [`PR: ${row.related_pr_url}`] : []),
  ];
  return { section: "attempts", id: row.id, title: `[${row.outcome.toUpperCase()}] ${row.problem}`, tags: row.agent ? [row.agent] : [], details, weight: succeeded ? W.succeededAttempt : W.failedAttempt, updatedAt: iso(row.created_at) };
}

function sourceItem(row: SourceRow): ContextItem {
  const isPr = row.source_type === "pull_request";
  const label = SOURCE_TYPE_LABELS[row.source_type as keyof typeof SOURCE_TYPE_LABELS] ?? row.source_type;
  return { section: isPr ? "prs" : "sources", id: row.id, title: row.title?.trim() || "Untitled", tags: [label], details: [...(row.url ? [row.url] : []), ...(row.content?.trim() ? [row.content] : [])], weight: isPr ? W.pullRequest : W.source, updatedAt: iso(row.updated_at ?? row.created_at) };
}

export const DRILL_DOWN = {
  constraints: "get_memory", facts: "get_memory", insights: "get_memory", memory: "get_memory",
  decisions: "get_decision", attempts: "list_attempts", prs: "get_knowledge_source", sources: "get_knowledge_source", files: "the project's Files page",
} as const;

/**
 * Session-free core of getTaskAgentContext (src/lib/context/agent-context.ts).
 * Kept out of the "use server" file on purpose: it takes a caller-supplied
 * `userId`, so exposing it as a Server Action would let any client build
 * context as another user. Callers must already have authenticated `userId`
 * (session via getProjectAccess, or API key via authenticateApiKey); every
 * query runs under RLS as that user, and the task must belong to `projectId`.
 */
export async function buildTaskAgentContext(
  userId: string,
  projectId: string,
  taskId: string,
  getSupabase: SupabaseClientFactory,
  options: ContextOptions = {}
): Promise<TaskAgentContext> {
  const db = dataClient(userId, { supabase: getSupabase });
  const [taskResult, why, memoryResult, attemptsResult] = await Promise.all([
    db.from<{ id: string; title: string; description: string | null; status: string; priority: string; tags: string[] | null }>("tasks")
      .select("id, title, description, status, priority, tags").eq("id", taskId).eq("project_id", projectId).maybeSingle(),
    buildTaskWhyContext(userId, projectId, taskId, getSupabase),
    db.from<MemoryRow>("project_memory").select(MEMORY_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }).limit(500),
    db.from<AttemptRow>("task_attempts").select(ATTEMPT_COLUMNS).eq("task_id", taskId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (taskResult.error) return FAIL("Could not load the task.");
  const task = taskResult.data;
  if (!task) return FAIL("Task not found.");
  if (why.error) return FAIL(why.error);

  // The Why panel only carries previews; the package needs full rows.
  const ids = (type: string) => why.related.filter((item) => item.entityType === type && !item.missing).map((item) => item.entityId);
  const decisionIds = new Set(ids("decision"));
  if (why.decision) decisionIds.add(why.decision.id);
  const [decisions, files, sources] = await Promise.all([
    decisionIds.size ? db.from<DecisionRow>("context_decisions").select(DECISION_COLUMNS).eq("project_id", projectId).in("id", [...decisionIds]) : Promise.resolve({ data: [] as DecisionRow[], error: null }),
    ids("file").length ? db.from<FileRow>("project_files").select("id, name, category, file_url, created_at").eq("project_id", projectId).in("id", ids("file")) : Promise.resolve({ data: [] as FileRow[], error: null }),
    ids("source").length ? db.from<SourceRow>("context_sources").select("id, title, content, url, source_type, created_at, updated_at").eq("project_id", projectId).in("id", ids("source")) : Promise.resolve({ data: [] as SourceRow[], error: null }),
  ]);

  const items: ContextItem[] = [
    ...memoryItems(memoryResult.data ?? []),
    ...(decisions.data ?? []).map((row) => why.decision?.id === row.id ? decisionItem(row, W.linkedDecision, ["linked decision"]) : decisionItem(row, W.relatedDecision)),
    ...(attemptsResult.data ?? []).map(attemptItem),
    ...(files.data ?? []).map((row): ContextItem => ({ section: "files", id: row.id, title: row.name, tags: row.category ? [row.category] : [], details: row.file_url ? [row.file_url] : [], weight: W.file, updatedAt: iso(row.created_at) })),
    ...(sources.data ?? []).map(sourceItem),
  ];

  const description = task.description?.trim() ? neutralize(task.description, 4000).text : "_No description._";
  const pack = packContext({
    title: `Agent Context: ${task.title}`,
    header: [
      "## Task",
      "",
      `**Title:** ${neutralize(task.title, 300).text}`,
      `**Status:** ${task.status}`,
      `**Priority:** ${task.priority}`,
      ...(task.tags?.length ? [`**Labels:** ${task.tags.map((tag) => neutralize(tag, 60).text).join(", ")}`] : []),
      "",
      description,
      "",
      "## Acceptance Criteria",
      "",
      "_Not yet tracked in Guidon as structured data - check the task description above for anything written inline._",
    ],
    items,
    budget: options.budget ?? CONTEXT_TOKEN_DEFAULT,
    focus: [task.title, task.description ?? "", options.focus ?? ""].join(" "),
    now: options.now ?? new Date(),
    drillDown: DRILL_DOWN,
  });
  return { markdown: pack.markdown, error: null, stats: pack.stats };
}
