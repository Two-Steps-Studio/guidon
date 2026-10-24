'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SelectMenu, SIDEBAR_SELECT_CLASS_NAME } from '@/components/ui/select-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FolderKanban } from 'lucide-react';
import type { SwitchableProject } from '@/lib/data/project-access';

interface ProjectSwitcherProps {
  projectId: string;
  currentProjectName: string;
  projects: SwitchableProject[];
}

/**
 * Jumps between projects in the same organization without a round trip
 * through /projects or /organizations/[id]. Reuses the shared SelectMenu
 * used by the sidebar's theme and language controls.
 *
 * The current project is always in the list - it comes from `projects`,
 * which is scoped to access.project.organization_id and RLS-filtered the
 * same way the projects page is, so it's guaranteed to include itself.
 */
export function ProjectSwitcher({ projectId, currentProjectName, projects }: ProjectSwitcherProps) {
  const t = useTranslations('nav');
  const router = useRouter();

  // Preserve a text fallback if the current project was omitted by the
  // caller, but keep the framed switcher visible even for a one-project org.
  if (projects.length === 0) {
    return (
      <div className="px-3 py-2 group-data-[collapsible=icon]:px-0" title={currentProjectName}>
        <div className="flex h-9 items-center justify-center text-sm font-medium text-foreground"><FolderKanban aria-hidden className="hidden size-4 group-data-[collapsible=icon]:block" /><span className="truncate group-data-[collapsible=icon]:hidden">{currentProjectName}</span></div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 group-data-[collapsible=icon]:px-0">
      <SelectMenu
        aria-label={t('switchProject')}
        value={projectId}
        options={projects.map((project) => ({ value: project.id, label: project.name, icon: (
          <Avatar className="size-5 rounded-sm">
            <AvatarImage src={project.avatar_url || undefined} alt="" className="object-cover" />
            <AvatarFallback className="rounded-sm"><FolderKanban className="size-3.5" /></AvatarFallback>
          </Avatar>
        ) }))}
        onValueChange={(nextId) => router.push(`/projects/${nextId}`)}
        className={`font-medium ${SIDEBAR_SELECT_CLASS_NAME}`}
      />
    </div>
  );
}
