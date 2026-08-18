import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { KnowledgeList } from "./knowledge-list";
import type { ContextSource } from "@/types/context";

export default async function ProjectKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
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

  return (
    <KnowledgeList
      projectId={projectId}
      initialSources={(sourcesRes.data ?? []) as ContextSource[]}
      counts={{
        decisions: decisionsRes.data?.length ?? 0,
        files: filesRes.data?.length ?? 0,
        memory: memoryRes.data?.length ?? 0,
      }}
      canWrite={canWriteProject(access.role)}
      canDelete={canManageProject(access.role)}
    />
  );
}
