'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import type { SwitchableProject } from '@/lib/data/project-access';

interface ProjectSwitcherProps {
  projectId: string;
  currentProjectName: string;
  projects: SwitchableProject[];
}

/**
 * Jumps between projects in the same organization without a round trip
 * through /projects or /organizations/[id]. Uses the plain <Select> already
 * used across the app (src/components/ui/select.tsx — native element, no
 * Radix listbox) rather than introducing a new dropdown component.
 *
 * The current project is always in the list — it comes from `projects`,
 * which is scoped to access.project.organization_id and RLS-filtered the
 * same way the projects page is, so it's guaranteed to include itself.
 */
export function ProjectSwitcher({ projectId, currentProjectName, projects }: ProjectSwitcherProps) {
  const router = useRouter();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    if (nextId && nextId !== projectId) {
      router.push(`/projects/${nextId}`);
    }
  };

  // Single-project orgs still show the switcher (consistent chrome), but as
  // plain text — a one-option select with nowhere to go isn't a control.
  if (projects.length <= 1) {
    return (
      <div className="px-3 py-2 text-sm font-medium text-foreground truncate" title={currentProjectName}>
        {currentProjectName}
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <Select
        aria-label="Switch project"
        value={projectId}
        onChange={handleChange}
        className="text-sm font-medium"
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
