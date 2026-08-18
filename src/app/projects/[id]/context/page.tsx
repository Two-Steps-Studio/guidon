import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { fetchProjectRelations } from "@/lib/context/project-relations";
import { ContextTabs } from "./context-tabs";
import type { Decision, ContextSource } from "@/types/context";

export default async function ProjectContextPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  const supabase = await createClient();

  // context_relations has no project_id column — relations are scoped
  // through their source entity. See lib/context/project-relations.ts.
  const [decisionsRes, sourcesRes, relations] = await Promise.all([
    supabase
      .from("context_decisions")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("context_sources")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    fetchProjectRelations(supabase, projectId),
  ]);

  return (
    <ContextTabs
      projectId={projectId}
      canWrite={canWriteProject(access.role)}
      canManage={canManageProject(access.role)}
      decisions={(decisionsRes.data ?? []) as Decision[]}
      relations={relations}
      sources={(sourcesRes.data ?? []) as ContextSource[]}
    />
  );
}
