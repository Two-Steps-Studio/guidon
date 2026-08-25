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

  // Safety cap, not pagination - there's no pagination UI here, so this
  // stays high enough that no real project should hit it today; it only
  // exists to stop an unbounded SELECT * from becoming a real cost as a
  // project's context grows.
  const LIST_LIMIT = 500;

  if (hasDirectDatabase()) {
    // Three withUser() calls, not one wrapping Promise.all([...]) - each
    // checks out its own pooled connection, so this is genuinely concurrent
    // instead of firing multiple queries on one pg client (the deprecated
    // shape, removed in pg@9).
    const [decisionsRes, sourcesRes, relationsRes] = await Promise.all([
      withUser(access.userId, ({ query }) =>
        query(
          "SELECT * FROM context_decisions WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
          [projectId, LIST_LIMIT]
        )
      ),
      withUser(access.userId, ({ query }) =>
        query(
          "SELECT * FROM context_sources WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
          [projectId, LIST_LIMIT]
        )
      ),
      // Same reasoning as fetchProjectRelations (project-relations.ts):
      // project_id is a direct, indexed column since migration 011, no
      // need to first collect every entity id in the project.
      withUser(access.userId, ({ query }) =>
        query(
          "SELECT * FROM context_relations WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
          [projectId, LIST_LIMIT]
        )
      ),
    ]);
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
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT),
      supabase
        .from("context_sources")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT),
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
