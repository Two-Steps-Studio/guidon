import { requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { SettingsForm } from "./settings-form";
import type { Project } from "@/types/project";
import type { Technology } from "@/types/technology";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  await requireProjectAccess(projectId);

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

  const project = projectRes.data as Project;
  const technologies = (techRes.data ?? []) as Technology[];

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
