import type { Metadata } from "next";
import { requireProjectAccess } from "@/lib/data/project-access";
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
 *
 * requireProjectAccess() is cached (src/lib/data/project-access.ts), so
 * calling it again here costs nothing: every page under this layout now
 * calls it itself to get typed access to `role`/`project` as props, rather
 * than through a client Context — there is no client state left that needs
 * one, so ProjectAccessProvider was removed rather than left unconsumed.
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
  await requireProjectAccess(id);

  return <ProjectSidebar projectId={id}>{children}</ProjectSidebar>;
}
