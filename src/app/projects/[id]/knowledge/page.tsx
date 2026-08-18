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

  if (hasDirectDatabase()) {
    const [sourcesRes, decisionsRes, filesRes, memoryRes] = await withUser(
      access.userId,
      ({ query }) =>
        Promise.all([
          query(
            "SELECT * FROM context_sources WHERE project_id = $1 ORDER BY created_at DESC",
            [projectId]
          ),
          query("SELECT id FROM context_decisions WHERE project_id = $1", [projectId]),
          query("SELECT id FROM project_files WHERE project_id = $1", [projectId]),
          query("SELECT id FROM project_memory WHERE project_id = $1", [projectId]),
        ])
    );

    sources = sourcesRes.rows;
    counts = {
      decisions: decisionsRes.rows.length,
      files: filesRes.rows.length,
      memory: memoryRes.rows.length,
    };
  } else {
    const supabase = await createClient();

    const [sourcesRes, decisionsRes, filesRes, memoryRes] = await Promise.all([
      supabase
        .from("context_sources")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase.from("context_decisions").select("id").eq("project_id", projectId),
      supabase.from("project_files").select("id").eq("project_id", projectId),
      supabase.from("project_memory").select("id").eq("project_id", projectId),
    ]);

    sources = (sourcesRes.data ?? []) as ContextSource[];
    counts = {
      decisions: decisionsRes.data?.length ?? 0,
      files: filesRes.data?.length ?? 0,
      memory: memoryRes.data?.length ?? 0,
    };
  }

  return (
    <KnowledgeList
      projectId={projectId}
      initialSources={sources}
      counts={counts}
      canWrite={canWriteProject(access.role)}
      canDelete={canManageProject(access.role)}
    />
  );
}
