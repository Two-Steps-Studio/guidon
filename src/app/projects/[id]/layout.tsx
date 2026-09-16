import type { Metadata } from "next";
import { requireProjectAccess, getSwitchableProjects } from "@/lib/data/project-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { AppShell } from "@/components/layout/app-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const { project } = await requireProjectAccess(id);
    return { title: `${project.name} - Guidon` };
  } catch {
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
  // getCurrentUser() doesn't depend on the project access check, so it runs
  // alongside it instead of after - getSwitchableProjects still has to wait,
  // since it needs access.project.organization_id.
  const [access, user] = await Promise.all([requireProjectAccess(id), getCurrentUser()]);
  const switchableProjects = await getSwitchableProjects(access.project.organization_id);

  return (
    <AppShell
      user={user}
      projectId={id}
      currentProjectName={access.project.name}
      projects={switchableProjects}
      projectColor={access.project.color}
    >
      {children}
    </AppShell>
  );
}
