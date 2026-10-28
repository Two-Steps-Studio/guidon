import "server-only";

/**
 * Agent context for a whole project (Context Engine): what an agent should
 * know before picking or planning work - constraints, verified facts, recent
 * decisions, knowledge sources and the rest of the project memory - ranked
 * and packed within a token budget like the task package
 * (src/lib/context/context-pack-core.ts). GET /api/v1/projects/{id}/context
 * and the get_project_context MCP tool. Read under RLS as the caller.
 */

import { dataClient } from "@/lib/data-client";
import type { SupabaseClientFactory } from "@/lib/context/task-why-builder";
import { TYPE_LABELS as SOURCE_TYPE_LABELS } from "@/app/projects/[id]/knowledge/source-config";
import { CONTEXT_TOKEN_DEFAULT, CONTEXT_WEIGHTS as W, neutralize, packContext, type ContextItem } from "@/lib/context/context-pack-core";
import { decisionItem, DECISION_COLUMNS, DRILL_DOWN, MEMORY_COLUMNS, memoryEvidence, memoryItems, type ContextOptions, type DecisionRow, type MemoryRow, type TaskAgentContext } from "@/lib/context/agent-context-builder";

type SourceRow = { id: string; title: string | null; content: string | null; url: string | null; source_type: string; created_at: string | Date | null; updated_at: string | Date | null };

export async function buildProjectAgentContext(userId: string, projectId: string, getSupabase: SupabaseClientFactory, options: ContextOptions = {}): Promise<TaskAgentContext> {
  const db = dataClient(userId, { supabase: getSupabase });
  const [project, memory, decisions, sources, evidence] = await Promise.all([
    db.from<{ id: string; name: string; description: string | null }>("projects").select("id, name, description").eq("id", projectId).maybeSingle(),
    db.from<MemoryRow>("project_memory").select(MEMORY_COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }).limit(500),
    db.from<DecisionRow>("context_decisions").select(DECISION_COLUMNS).eq("project_id", projectId).order("updated_at", { ascending: false }).limit(100),
    db.from<SourceRow>("context_sources").select("id, title, content, url, source_type, created_at, updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(100),
    memoryEvidence(db, projectId),
  ]);
  if (project.error) return { markdown: "", error: "Could not load the project." };
  if (!project.data) return { markdown: "", error: "Project not found." };

  const items: ContextItem[] = [
    ...memoryItems(memory.data ?? [], evidence),
    // Approved decisions are the ones that bind the work; others are history.
    ...(decisions.data ?? []).map((row) => decisionItem(row, row.status === "approved" ? W.relatedDecision : W.recentDecision)),
    ...(sources.data ?? []).map((row): ContextItem => ({
      section: row.source_type === "pull_request" ? "prs" : "sources",
      id: row.id,
      title: row.title?.trim() || "Untitled",
      tags: [SOURCE_TYPE_LABELS[row.source_type as keyof typeof SOURCE_TYPE_LABELS] ?? row.source_type],
      details: [...(row.url ? [row.url] : []), ...(row.content?.trim() ? [row.content] : [])],
      weight: W.source,
      updatedAt: row.updated_at || row.created_at ? new Date((row.updated_at ?? row.created_at)!).toISOString() : null,
    })),
  ];
  const pack = packContext({
    title: `Project Context: ${project.data.name}`,
    header: ["## Project", "", `**Name:** ${neutralize(project.data.name, 200).text}`, "", project.data.description?.trim() ? neutralize(project.data.description, 4000).text : "_No description._"],
    items,
    budget: options.budget ?? CONTEXT_TOKEN_DEFAULT,
    focus: [project.data.name, options.focus ?? ""].join(" "),
    now: options.now ?? new Date(),
    drillDown: DRILL_DOWN,
  });
  return { markdown: pack.markdown, error: null, stats: pack.stats };
}
