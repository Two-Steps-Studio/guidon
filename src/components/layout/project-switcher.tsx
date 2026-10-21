'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SelectMenu } from '@/components/ui/select-menu';
import type { SwitchableProject } from '@/lib/data/project-access';

interface ProjectSwitcherProps {
  projectId: string;
  currentProjectName: string;
  projects: SwitchableProject[];
}

/**
 * Jumps between projects in the same organization without a round trip
 * through /projects or /organizations/[id]. Uses the plain <Select> already
 * used across the app (src/components/ui/select.tsx - native element, no
 * Radix listbox) rather than introducing a new dropdown component.
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
      <div className="px-3 py-2 text-sm font-medium text-foreground truncate group-data-[collapsible=icon]:hidden" title={currentProjectName}>
        {currentProjectName}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 group-data-[collapsible=icon]:hidden">
      <SelectMenu
        aria-label={t('switchProject')}
        value={projectId}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        onValueChange={(nextId) => router.push(`/projects/${nextId}`)}
        className="font-medium"
      />
    </div>
  );
}
