"use server";

/**
 * Generic Agent Context export — TODO.md §18 ("provider-neutral context
 * package") applied to a single task. Assembles data Guidon already has into
 * a plain Markdown document that can be pasted into any external AI coding
 * agent (Claude Code, Cursor, Codex, Windsurf, OpenAI-compatible agents).
 *
 * Deliberately out of scope here (see TODO.md §18's own wording — "MCP
 * support should be designed as an interface, not as the core data model"):
 *   - MCP transport/server — this only produces the data package.
 *   - AI-generated summarization — everything below is assembled verbatim
 *     from rows that already exist; nothing is passed through src/lib/ai/*.
 *   - "Acceptance Criteria" and "Previous Attempts" as first-class data —
 *     grepped the schema, neither is tracked anywhere yet. Noted as gaps in
 *     the output rather than fabricated.
 *
 * Reuses getTaskWhyContext (src/lib/context/task-why.ts) for the task's
 * linked decision and everything reachable via context_relations, then adds
 * two things task-why.ts doesn't need for the "Why" panel:
 *   1. Project-wide project_memory rows (constraints/rules apply to the
 *      whole project, not just what happens to be relation-linked to this
 *      task — TODO.md §19's model).
 *   2. Fuller rows (untruncated content, plus columns task-why.ts's preview
 *      logic doesn't select, like context_sources.source_type and
 *      project_files.file_url/category) for the related decisions, files and
 *      sources it found — the Why panel only needs a short preview, an agent
 *      context package needs the whole thing.
 *
 * Per-item attribution (who created what) is deliberately left out of the
 * export — that's an audit-trail concern the Why panel already covers in the
 * UI, not something an external coding agent needs in its context window.
 */

import { createClient } from "@/lib/supabase-server";
import { getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getTaskWhyContext } from "@/lib/context/task-why";
import { MEMORY_TYPE_CONFIG } from "@/app/projects/[id]/memory/memory-type-config";
import { TYPE_LABELS as SOURCE_TYPE_LABELS } from "@/app/projects/[id]/knowledge/source-config";
import type { MemoryType } from "@/types/context";

export interface TaskAgentContext {
  markdown: string;
  error: string | null;
}

const FAIL = (error: string): TaskAgentContext => ({ markdown: "", error });

interface MemoryRow {
  id: string;
  content: string;
  memory_type: MemoryType;
  verified: boolean;
  confidence: number | null;
}

interface DecisionRow {
  id: string;
  title: string;
  status: string;
  decision_type: string;
  description: string | null;
}

interface FileRow {
  id: string;
  name: string;
  category: string | null;
  file_url: string | null;
}

interface SourceRow {
  id: string;
  title: string | null;
  content: string | null;
  url: string | null;
  source_type: string;
}

function heading(level: number, text: string): string {
  return `${"#".repeat(level)} ${text}`;
}

function section(title: string, body: string[]): string {
  const content = body.length > 0 ? body.join("\n") : "_Nothing recorded._";
  return `${heading(2, title)}\n\n${content}`;
}

function formatConfidence(confidence: number | null): string {
  return confidence === null ? "confidence unknown" : `confidence ${Math.round(confidence * 100)}%`;
}

export async function getTaskAgentContext(projectId: string, taskId: string): Promise<TaskAgentContext> {
  const access = await getProjectAccess(projectId);
  if (!access) return FAIL("You do not have access to this project.");

  type TaskRow = {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    tags: string[] | null;
  };

  let task: TaskRow;
  let whyContext: Awaited<ReturnType<typeof getTaskWhyContext>>;
  let memory: MemoryRow[];

  if (hasDirectDatabase()) {
    const [taskRows, why, memoryRows] = await Promise.all([
      withUser(access.userId, ({ query }) =>
        query("SELECT id, title, description, status, priority, tags FROM tasks WHERE id = $1", [
          taskId,
        ])
      ),
      getTaskWhyContext(projectId, taskId),
      withUser(access.userId, ({ query }) =>
        query(
          "SELECT id, content, memory_type, verified, confidence FROM project_memory WHERE project_id = $1 ORDER BY created_at DESC",
          [projectId]
        )
      ),
    ]);

    if (taskRows.rows.length === 0) return FAIL("Task not found.");
    if (why.error) return FAIL(why.error);

    task = taskRows.rows[0] as TaskRow;
    whyContext = why;
    memory = memoryRows.rows;
  } else {
    const supabase = await createClient();

    const [taskRes, why, memoryRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, description, status, priority, tags")
        .eq("id", taskId)
        .maybeSingle(),
      getTaskWhyContext(projectId, taskId),
      supabase
        .from("project_memory")
        .select("id, content, memory_type, verified, confidence")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
    ]);

    if (taskRes.error || !taskRes.data) return FAIL(taskRes.error?.message ?? "Task not found.");
    if (why.error) return FAIL(why.error);

    task = taskRes.data as TaskRow;
    whyContext = why;
    memory = (memoryRes.data ?? []) as MemoryRow[];
  }

  // Related decisions / files / sources need fuller rows than task-why.ts's
  // Why-panel preview carries (untruncated content, plus columns like
  // source_type and file_url the panel has no use for) — refetched here
  // rather than widening task-why.ts's queries for a UI that doesn't need them.
  const relatedDecisionIds = new Set(
    whyContext.related.filter((item) => item.entityType === "decision" && !item.missing).map((item) => item.entityId)
  );
  if (whyContext.decision) relatedDecisionIds.add(whyContext.decision.id);

  const relatedFileIds = new Set(
    whyContext.related.filter((item) => item.entityType === "file" && !item.missing).map((item) => item.entityId)
  );

  const relatedSourceIds = new Set(
    whyContext.related.filter((item) => item.entityType === "source" && !item.missing).map((item) => item.entityId)
  );

  let decisions: DecisionRow[];
  let files: FileRow[];
  let sources: SourceRow[];

  if (hasDirectDatabase()) {
    [decisions, files, sources] = await withUser(access.userId, async ({ query }) => {
      const [decisionsRows, filesRows, sourcesRows] = await Promise.all([
        relatedDecisionIds.size > 0
          ? query(
              "SELECT id, title, status, decision_type, description FROM context_decisions WHERE id = ANY($1::uuid[])",
              [Array.from(relatedDecisionIds)]
            )
          : Promise.resolve({ rows: [] as DecisionRow[] }),
        relatedFileIds.size > 0
          ? query("SELECT id, name, category, file_url FROM project_files WHERE id = ANY($1::uuid[])", [
              Array.from(relatedFileIds),
            ])
          : Promise.resolve({ rows: [] as FileRow[] }),
        relatedSourceIds.size > 0
          ? query(
              "SELECT id, title, content, url, source_type FROM context_sources WHERE id = ANY($1::uuid[])",
              [Array.from(relatedSourceIds)]
            )
          : Promise.resolve({ rows: [] as SourceRow[] }),
      ]);

      return [decisionsRows.rows, filesRows.rows, sourcesRows.rows] as const;
    });
  } else {
    const supabase = await createClient();

    const [decisionsRes, filesRes, sourcesRes] = await Promise.all([
      relatedDecisionIds.size > 0
        ? supabase
            .from("context_decisions")
            .select("id, title, status, decision_type, description")
            .in("id", Array.from(relatedDecisionIds))
        : Promise.resolve({ data: [] as DecisionRow[] }),
      relatedFileIds.size > 0
        ? supabase.from("project_files").select("id, name, category, file_url").in("id", Array.from(relatedFileIds))
        : Promise.resolve({ data: [] as FileRow[] }),
      relatedSourceIds.size > 0
        ? supabase
            .from("context_sources")
            .select("id, title, content, url, source_type")
            .in("id", Array.from(relatedSourceIds))
        : Promise.resolve({ data: [] as SourceRow[] }),
    ]);

    decisions = (decisionsRes.data ?? []) as DecisionRow[];
    files = (filesRes.data ?? []) as FileRow[];
    sources = (sourcesRes.data ?? []) as SourceRow[];
  }

  // --- Task ---------------------------------------------------------------
  const taskSection = section("Task", [
    `**Title:** ${task.title}`,
    `**Status:** ${task.status}`,
    `**Priority:** ${task.priority}`,
    ...(task.tags && task.tags.length > 0 ? [`**Labels:** ${task.tags.join(", ")}`] : []),
    "",
    task.description?.trim() ? task.description.trim() : "_No description._",
  ]);

  // --- Acceptance Criteria (not tracked) -----------------------------------
  const acceptanceSection = section("Acceptance Criteria", [
    "_Not yet tracked in Guidon as structured data — check the task description above for anything written inline._",
  ]);

  // --- Project Memory, bucketed --------------------------------------------
  const constraints = memory.filter((row) => row.memory_type === "constraint" || row.memory_type === "project_rule");
  const verifiedFacts = memory.filter((row) => row.memory_type === "fact" && row.verified);
  const aiInsights = memory.filter((row) => row.memory_type === "ai_insight");
  // Everything project_memory tracks that isn't one of the three buckets
  // above: unverified facts (not promoted to "Verified Facts" yet) and the
  // remaining memory types (preference, decision_summary, observation).
  const otherMemory = memory.filter(
    (row) => !constraints.includes(row) && !verifiedFacts.includes(row) && !aiInsights.includes(row)
  );

  const constraintsSection = section(
    "Project Constraints",
    constraints.map((row) => `- **${MEMORY_TYPE_CONFIG[row.memory_type].label}:** ${row.content}`)
  );

  const verifiedFactsSection = section(
    "Verified Facts",
    verifiedFacts.map((row) => `- ${row.content}`)
  );

  const aiInsightsSection = section(
    "AI Insights",
    aiInsights.map(
      (row) => `- ${row.content} _(${formatConfidence(row.confidence)}, ${row.verified ? "verified" : "unverified"})_`
    )
  );

  // --- Related Decisions ----------------------------------------------------
  const decisionLines = decisions.map((row) => {
    const linked = whyContext.decision?.id === row.id ? " — linked decision" : "";
    const description = row.description?.trim() ? `\n  ${row.description.trim()}` : "";
    return `- **${row.title}** (${row.decision_type}, ${row.status})${linked}${description}`;
  });
  const decisionsSection = section("Related Decisions", decisionLines);

  // --- Relevant Files ---------------------------------------------------------
  const filesSection = section(
    "Relevant Files",
    files.map((row) => `- ${row.name}${row.category ? ` (${row.category})` : ""}${row.file_url ? ` — ${row.file_url}` : ""}`)
  );

  // --- Related PRs / Relevant Sources, split by context_sources.source_type ---
  const prs = sources.filter((row) => row.source_type === "pull_request");
  const otherSources = sources.filter((row) => row.source_type !== "pull_request");

  const sourceLine = (row: SourceRow): string => {
    const label = SOURCE_TYPE_LABELS[row.source_type as keyof typeof SOURCE_TYPE_LABELS] ?? row.source_type;
    const title = row.title?.trim() || "Untitled";
    const url = row.url ? ` — ${row.url}` : "";
    const body = row.content?.trim() ? `\n  ${row.content.trim()}` : "";
    return `- **${title}** (${label})${url}${body}`;
  };

  const prsSection = section("Related PRs", prs.map(sourceLine));

  // --- Previous Attempts (not tracked) ---------------------------------------
  const attemptsSection = section("Previous Attempts", [
    "_Not yet tracked in Guidon._",
  ]);

  // --- Other Project Memory (unverified facts + preference/decision_summary/observation) ---
  const otherMemorySection = section(
    "Other Project Memory",
    otherMemory.map(
      (row) =>
        `- **${MEMORY_TYPE_CONFIG[row.memory_type].label}${row.memory_type === "fact" ? " (unverified)" : ""}:** ${row.content}`
    )
  );

  const sourcesSection = section("Relevant Sources", otherSources.map(sourceLine));

  const markdown = [
    heading(1, `Agent Context: ${task.title}`),
    taskSection,
    acceptanceSection,
    constraintsSection,
    verifiedFactsSection,
    aiInsightsSection,
    decisionsSection,
    filesSection,
    prsSection,
    attemptsSection,
    otherMemorySection,
    sourcesSection,
  ].join("\n\n");

  return { markdown, error: null };
}
