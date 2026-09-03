import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getProjectGithubRepoInfo } from "@/lib/data/github-connection";
import { FilesBrowser } from "./files-browser";
import type { ProjectFile } from "@/types/api";

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  // Safety cap, not pagination - same pattern as decisions/memory/knowledge/
  // context (LIST_LIMIT = 500). storage_limit_bytes bounds total file size,
  // not file count, so nothing else bounds how many rows this can return.
  const LIST_LIMIT = 500;

  let files: ProjectFile[];

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query(
        "SELECT * FROM project_files WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2",
        [projectId, LIST_LIMIT]
      )
    );
    files = result.rows;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw new Error(`Failed to load files: ${error.message}`);

    files = (data ?? []) as ProjectFile[];
  }

  const githubRepoInfo = await getProjectGithubRepoInfo(projectId, access.userId);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <FilesBrowser
        projectId={projectId}
        files={files}
        canWrite={canWriteProject(access.role)}
        canManage={canManageProject(access.role)}
        projectColor={access.project.color}
        githubRepoInfo={githubRepoInfo}
      />
    </div>
  );
}
