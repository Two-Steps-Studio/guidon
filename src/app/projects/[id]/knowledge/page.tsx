import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { KnowledgeList } from "./knowledge-list";
import type { ContextSource } from "@/types/context";

export default async function ProjectKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  let sources: ContextSource[];
  let counts: { decisions: number; files: number; memory: number };

  // Safety cap, not pagination - see src/app/projects/[id]/work/page.tsx
  // for the same reasoning applied to tasks.
  const LIST_LIMIT = 500;

  if (hasDirectDatabase()) {
    // Four withUser() calls, not one wrapping Promise.all([...]) - each
    // checks out its own pooled connection, so this is genuinely concurrent
    // instead of firing multiple queries on one pg client (the deprecated
    // shape, removed in pg@9).
    const [sourcesRes, decisionsRes, filesRes, memoryRes] = await Promise.all([
      withUser(access.userId, ({ query }) =>
        query(
          "SELECT * FROM context_sources WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
          [projectId, LIST_LIMIT]
        )
      ),
      withUser(access.userId, ({ query }) =>
        query("SELECT count(*) AS total FROM context_decisions WHERE project_id = $1", [projectId])
      ),
      withUser(access.userId, ({ query }) =>
        query("SELECT count(*) AS total FROM project_files WHERE project_id = $1", [projectId])
      ),
      withUser(access.userId, ({ query }) =>
        query("SELECT count(*) AS total FROM project_memory WHERE project_id = $1", [projectId])
      ),
    ]);

    sources = sourcesRes.rows;
    counts = {
      decisions: Number(decisionsRes.rows[0]?.total ?? 0),
      files: Number(filesRes.rows[0]?.total ?? 0),
      memory: Number(memoryRes.rows[0]?.total ?? 0),
    };
  } else {
    const supabase = await createClient();

    const [sourcesRes, decisionsRes, filesRes, memoryRes] = await Promise.all([
      supabase
        .from("context_sources")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT),
      supabase.from("context_decisions").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("project_files").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("project_memory").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    ]);
    if (sourcesRes.error) throw new Error(`Failed to load sources: ${sourcesRes.error.message}`);
    if (decisionsRes.error) throw new Error(`Failed to load decisions: ${decisionsRes.error.message}`);
    if (filesRes.error) throw new Error(`Failed to load files: ${filesRes.error.message}`);
    if (memoryRes.error) throw new Error(`Failed to load memory: ${memoryRes.error.message}`);

    sources = (sourcesRes.data ?? []) as ContextSource[];
    counts = {
      decisions: decisionsRes.count ?? 0,
      files: filesRes.count ?? 0,
      memory: memoryRes.count ?? 0,
    };
  }

  return (
    <KnowledgeList
      projectId={projectId}
      initialSources={sources}
      counts={counts}
      canWrite={canWriteProject(access.role)}
      canDelete={canManageProject(access.role)}
      projectColor={access.project.color}
    />
  );
}
