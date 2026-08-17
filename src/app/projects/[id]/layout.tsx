import type { Metadata } from "next";
import {
  canCommentOnProject,
  canManageProject,
  canWriteProject,
  requireProjectAccess,
} from "@/lib/data/project-access";
import { ProjectAccessProvider } from "@/contexts/project-access-context";
import { ProjectSidebar } from "@/components/layout/project-sidebar";

/**
 * Project workspace shell.
 *
 * A Server Component, so the project and the caller's role are resolved once
 * per navigation instead of once per page — and before any HTML is sent, which
 * is what lets an unauthorised visitor be redirected rather than shown a
 * loading spinner that resolves into an error (TODO.md §34, §38).
 *
 * Pages below no longer wrap themselves in ProjectSidebar; the shell lives
 * here, so switching tabs keeps the sidebar mounted.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const { project } = await requireProjectAccess(id);
    return { title: `${project.name} — Guidon` };
  } catch {
    // requireProjectAccess redirects; metadata must not crash the render.
    return { title: "Guidon" };
  }
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireProjectAccess(id);

  return (
    <ProjectAccessProvider
      value={{
        userId: access.userId,
        project: access.project,
        role: access.role,
        canManage: canManageProject(access.role),
        canWrite: canWriteProject(access.role),
        canComment: canCommentOnProject(access.role),
      }}
    >
      <ProjectSidebar projectId={id}>{children}</ProjectSidebar>
    </ProjectAccessProvider>
  );
}
