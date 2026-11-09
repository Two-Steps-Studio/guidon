import "server-only";

import type { DataClient } from "@/lib/data-client";
import { getBriefVersion } from "@/lib/data/agent-brief";
import { generateAgentsMd } from "@/lib/context/agents-md-core";
import { SITE_URL } from "@/lib/site-url";

// shortcut: dead ends come from the project's most recently updated tasks
// only; a project with more active history than this needs a paged export.
const RECENT_TASKS = 200;
const DEAD_ENDS = 40;
const FACTS = 100;

// Timestamps arrive as Date objects through pg (self-hosted) and as strings through PostgREST.
type Stamp = string | Date | null;
const time = (value: Stamp) => (value ? new Date(value).getTime() : 0);

/**
 * The project as an AGENTS.md file (agents-md-core.ts): approved brief,
 * verified facts, known dead ends - read through the given RLS-scoped
 * client. null when the caller can't see the project; throws on a read error.
 */
export async function buildAgentsMd(db: DataClient, projectId: string): Promise<string | null> {
  const [project, brief, facts, tasks] = await Promise.all([
    db.from<{ id: string; name: string }>("projects").select("id, name").eq("id", projectId).maybeSingle(),
    getBriefVersion(db, projectId),
    db.from<{ id: string; content: string; verified_at: Stamp }>("project_memory").select("id, content, verified_at").eq("project_id", projectId).eq("verified", true)
      .order("verified_at", { ascending: false }).limit(FACTS),
    db.from<{ id: string; title: string }>("tasks").select("id, title").eq("project_id", projectId)
      .order("updated_at", { ascending: false, nullsFirst: false }).order("id").limit(RECENT_TASKS),
  ]);
  if (project.error || facts.error || tasks.error) throw new Error("Could not read the project.");
  if (!project.data) return null;

  const titles = new Map(tasks.data.map((task) => [task.id, task.title]));
  const attempts: { id: string; task_id: string; approach: string; outcome: string; failure_reason: string | null; created_at: Stamp }[] = [];
  // Bounded URLs, as in agent-monitoring.ts; every id came from the RLS-scoped query above.
  for (let offset = 0; offset < tasks.data.length; offset += 50) {
    const result = await db.from<(typeof attempts)[number]>("task_attempts").select("id, task_id, approach, outcome, failure_reason, created_at")
      .in("task_id", tasks.data.slice(offset, offset + 50).map((task) => task.id))
      .in("outcome", ["failed", "partial"])
      .order("created_at", { ascending: false }).limit(DEAD_ENDS);
    if (result.error) throw new Error("Could not read the project's attempts.");
    attempts.push(...result.data);
  }
  attempts.sort((a, b) => time(b.created_at) - time(a.created_at));

  return generateAgentsMd({
    project: project.data,
    siteUrl: SITE_URL,
    generatedAt: new Date(),
    brief: brief ? { version: brief.version, content: brief.content } : null,
    facts: facts.data.map((fact) => ({ ...fact, verified_at: fact.verified_at ? new Date(fact.verified_at).toISOString() : null })),
    deadEnds: attempts.slice(0, DEAD_ENDS).map((attempt) => ({ ...attempt, task_title: titles.get(attempt.task_id) ?? "Task" })),
  });
}
