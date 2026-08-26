import { redirect } from "next/navigation";
import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { RepoPicker } from "./repo-picker";

/**
 * Landing page after the GitHub OAuth callback (src/app/api/github/callback)
 * - the token is sitting in a short-lived pending cookie at this point, not
 * yet written to github_connections, until the user picks a repo here.
 */
export default async function ConnectRepoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  if (!canManageProject(access.role)) {
    redirect(`/projects/${projectId}/files`);
  }

  return (
    <div className="container mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-bold">Choose a repository</h1>
      <p className="mb-6 text-muted-foreground">
        Pick which GitHub repository to link to this project.
      </p>
      <RepoPicker projectId={projectId} />
    </div>
  );
}
