"use server";

/**
 * Generic Agent Context export - TODO.md §18 ("provider-neutral context
 * package") applied to a single task. Assembles data Guidon already has into
 * a plain Markdown document that can be pasted into any external AI coding
 * agent (Claude Code, Cursor, Codex, Windsurf, OpenAI-compatible agents).
 *
 * Deliberately out of scope here (see TODO.md §18's own wording - "MCP
 * support should be designed as an interface, not as the core data model"):
 *   - MCP transport/server - this only produces the data package.
 *   - AI-generated summarization - everything below is assembled verbatim
 *     from rows that already exist; nothing is passed through src/lib/ai/*.
 *   - "Acceptance Criteria" as first-class data - grepped the schema, not
 *     tracked anywhere yet. Noted as a gap in the output rather than
 *     fabricated. "Previous Attempts" WAS this kind of gap until migration
 *     013 (task_attempts, TODO.md §22) - it's real data now, pulled below.
 *
 * Reuses getTaskWhyContext (src/lib/context/task-why.ts) for the task's
 * linked decision and everything reachable via context_relations, then adds
 * two things task-why.ts doesn't need for the "Why" panel:
 *   1. Project-wide project_memory rows (constraints/rules apply to the
 *      whole project, not just what happens to be relation-linked to this
 *      task - TODO.md §19's model).
 *   2. Fuller rows (untruncated content, plus columns task-why.ts's preview
 *      logic doesn't select, like context_sources.source_type and
 *      project_files.file_url/category) for the related decisions, files and
 *      sources it found - the Why panel only needs a short preview, an agent
 *      context package needs the whole thing.
 *
 * Per-item attribution (who created what) is deliberately left out of the
 * export - that's an audit-trail concern the Why panel already covers in the
 * UI, not something an external coding agent needs in its context window.
 */

import { createClient } from "@/lib/supabase-server";
import { getProjectAccess } from "@/lib/data/project-access";
import { buildTaskAgentContext, type TaskAgentContext } from "@/lib/context/agent-context-builder";

// Type-only re-export (erased at build time, allowed in a "use server" file).
// The session-free builder lives in agent-context-builder.ts and must NOT be
// exported from here - see the comment there.
export type { TaskAgentContext } from "@/lib/context/agent-context-builder";

export async function getTaskAgentContext(projectId: string, taskId: string): Promise<TaskAgentContext> {
  const access = await getProjectAccess(projectId);
  if (!access) return { markdown: "", error: "You do not have access to this project." };

  return buildTaskAgentContext(access.userId, projectId, taskId, () => createClient());
}
