import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { FilesBrowser } from "./files-browser";
import type { ProjectFile } from "@/types/api";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  let files: ProjectFile[];

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query("SELECT * FROM project_files WHERE project_id = $1 ORDER BY created_at DESC", [
        projectId,
      ])
    );
    files = result.rows;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load files: ${error.message}`);

    files = (data ?? []) as ProjectFile[];
  }

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <FilesBrowser
        projectId={projectId}
        files={files}
        canWrite={canWriteProject(access.role)}
        canManage={canManageProject(access.role)}
        projectColor={access.project.color}
      />
    </div>
  );
}
