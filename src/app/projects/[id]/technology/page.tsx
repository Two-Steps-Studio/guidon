import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { TechnologyList } from "./technology-list";
import type { Technology } from "@/types/technology";

export default async function ProjectTechnologyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  const supabase = await createClient();
  const { data } = await supabase
    .from("technologies")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (
    <TechnologyList
      projectId={projectId}
      projectName={access.project.name}
      role={access.role}
      canManage={canManageProject(access.role)}
      initialTechnologies={(data ?? []) as Technology[]}
    />
  );
}
