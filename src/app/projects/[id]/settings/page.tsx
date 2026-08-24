import { requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { SettingsForm } from "./settings-form";
import { AiPermissionsForm } from "./ai-permissions-form";
import type { Project } from "@/types/project";
import type { Technology } from "@/types/technology";

interface AiPermissionsRow {
  can_read_context: boolean;
  can_create_comments: boolean;
  can_change_status: boolean;
  can_complete_tasks: boolean;
  can_modify_settings: boolean;
  can_delete_tasks: boolean;
}

const DEFAULT_AI_PERMISSIONS: AiPermissionsRow = {
  can_read_context: true,
  can_create_comments: true,
  can_change_status: true,
  can_complete_tasks: false,
  can_modify_settings: false,
  can_delete_tasks: false,
};

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  let project: Project;
  let technologies: Technology[];
  let aiPermissions: AiPermissionsRow;

  if (hasDirectDatabase()) {
    const [projectRes, techRes, permsRes] = await withUser(access.userId, ({ query }) =>
      Promise.all([
        query("SELECT * FROM projects WHERE id = $1", [projectId]),
        query(
          `SELECT * FROM technologies WHERE project_id = $1
           ORDER BY sort_order ASC NULLS LAST, name ASC`,
          [projectId]
        ),
        query(
          "SELECT can_read_context, can_create_comments, can_change_status, can_complete_tasks, can_modify_settings, can_delete_tasks FROM project_ai_permissions WHERE project_id = $1",
          [projectId]
        ),
      ])
    );
    project = projectRes.rows[0];
    technologies = techRes.rows;
    aiPermissions = permsRes.rows[0] ?? DEFAULT_AI_PERMISSIONS;
  } else {
    const supabase = await createClient();
    const [projectRes, techRes, permsRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase
        .from("technologies")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("project_ai_permissions")
        .select("can_read_context, can_create_comments, can_change_status, can_complete_tasks, can_modify_settings, can_delete_tasks")
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);

    project = projectRes.data as Project;
    technologies = (techRes.data ?? []) as Technology[];
    aiPermissions = (permsRes.data as AiPermissionsRow | null) ?? DEFAULT_AI_PERMISSIONS;
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Project Settings</h1>
        <p className="text-muted-foreground">Manage project configuration and preferences</p>
      </div>

      <SettingsForm project={project} initialTechnologies={technologies.map((t) => t.name)} />
      <AiPermissionsForm
        projectId={projectId}
        permissions={aiPermissions}
        allowAutoComplete={project.allow_ai_auto_complete}
      />
    </div>
  );
}
