import type { Metadata } from "next";
import { showAi } from "@/lib/data/ai-preference";
import { canWriteProject, requireProjectAccess, getSwitchableProjects } from "@/lib/data/project-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { AppShell } from "@/components/layout/app-shell";
import { AIChat } from "@/components/ai/AIChat";
import { getProjectModuleLinks } from "@/lib/data/project-module-navigation";
import { approvalSummary } from "@/lib/data/agent-approvals";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const { project } = await requireProjectAccess(id);
    // The root layout's title template appends " | Guidon".
    return { title: project.name };
  } catch {
    return { title: { absolute: "Guidon" } };
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
  const [switchableProjects, moduleLinks, approvals] = await Promise.all([
    getSwitchableProjects(access.project.organization_id),
    getProjectModuleLinks(access.userId, id),
    approvalSummary(access.userId, id),
  ]);

  return (
    <AppShell
      user={user}
      projectId={id}
      currentProjectName={access.project.name}
      projects={switchableProjects}
      projectColor={access.project.color}
      disabledModules={access.project.disabled_modules}
      moduleLinks={moduleLinks}
      approvals={approvals}
    >
      {children}
      {canWriteProject(access.role) && (await showAi(access.userId, access.project.ai_enabled)) && <AIChat projectId={id} />}
    </AppShell>
  );
}
