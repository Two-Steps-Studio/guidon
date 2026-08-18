import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { fetchProjectRelations } from "@/lib/context/project-relations";
import { ContextTabs } from "./context-tabs";
import type { Decision, ContextSource, ContextRelation } from "@/types/context";

export default async function ProjectContextPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  let decisions: Decision[];
  let sources: ContextSource[];
  let relations: ContextRelation[];

  if (hasDirectDatabase()) {
    const [decisionsRes, sourcesRes, relationsRes] = await withUser(access.userId, ({ query }) =>
      Promise.all([
        query("SELECT * FROM context_decisions WHERE project_id = $1 ORDER BY created_at DESC", [
          projectId,
        ]),
        query("SELECT * FROM context_sources WHERE project_id = $1 ORDER BY created_at DESC", [
          projectId,
        ]),
        // Same reasoning as fetchProjectRelations (project-relations.ts):
        // project_id is a direct, indexed column since migration 011, no
        // need to first collect every entity id in the project.
        query("SELECT * FROM context_relations WHERE project_id = $1 ORDER BY created_at DESC", [
          projectId,
        ]),
      ])
    );
    decisions = decisionsRes.rows;
    sources = sourcesRes.rows;
    relations = relationsRes.rows;
  } else {
    const supabase = await createClient();

    const [decisionsRes, sourcesRes, relationsRes] = await Promise.all([
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

    decisions = (decisionsRes.data ?? []) as Decision[];
    sources = (sourcesRes.data ?? []) as ContextSource[];
    relations = relationsRes;
  }

  return (
    <ContextTabs
      projectId={projectId}
      canWrite={canWriteProject(access.role)}
      canManage={canManageProject(access.role)}
      decisions={decisions}
      relations={relations}
      sources={sources}
    />
  );
}
