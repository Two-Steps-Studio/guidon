import { requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { SettingsForm } from "./settings-form";
import type { Project } from "@/types/project";
import type { Technology } from "@/types/technology";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  let project: Project;
  let technologies: Technology[];

  if (hasDirectDatabase()) {
    const [projectRes, techRes] = await withUser(access.userId, ({ query }) =>
      Promise.all([
        query("SELECT * FROM projects WHERE id = $1", [projectId]),
        query(
          `SELECT * FROM technologies WHERE project_id = $1
           ORDER BY sort_order ASC NULLS LAST, name ASC`,
          [projectId]
        ),
      ])
    );
    project = projectRes.rows[0];
    technologies = techRes.rows;
  } else {
    const supabase = await createClient();
    const [projectRes, techRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase
        .from("technologies")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
    ]);

    project = projectRes.data as Project;
    technologies = (techRes.data ?? []) as Technology[];
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Project Settings</h1>
        <p className="text-muted-foreground">Manage project configuration and preferences</p>
      </div>

      <SettingsForm project={project} initialTechnologies={technologies.map((t) => t.name)} />
    </div>
  );
}
