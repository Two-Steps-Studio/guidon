'use client';

import React, { createContext, useContext, useState } from 'react';
import type { Project, ProjectMember } from '@/types/project';

interface ProjectContextType {
  currentProject: Project | null;
  projectMembers: ProjectMember[];
  setCurrentProject: (project: Project | null) => void;
  setProjectMembers: (members: ProjectMember[]) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(false);

  return (
    <ProjectContext.Provider
      value={{
        currentProject,
        projectMembers,
        setCurrentProject,
        setProjectMembers,
        loading,
        setLoading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
