import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { TechnologyList } from "./technology-list";
import type { Technology } from "@/types/technology";

export default async function ProjectTechnologyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  let technologies: Technology[];

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query(
        `SELECT * FROM technologies WHERE project_id = $1
         ORDER BY sort_order ASC NULLS LAST, name ASC`,
        [projectId]
      )
    );
    technologies = result.rows;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("technologies")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    technologies = (data ?? []) as Technology[];
  }

  return (
    <TechnologyList
      projectId={projectId}
      projectName={access.project.name}
      role={access.role}
      canManage={canManageProject(access.role)}
      initialTechnologies={technologies}
    />
  );
}
