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
    return { title: `${project.name} — Guidon` };
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
  const access = await requireProjectAccess(id);
  const switchableProjects = await getSwitchableProjects(access.project.organization_id);
  const user = await getCurrentUser();

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
