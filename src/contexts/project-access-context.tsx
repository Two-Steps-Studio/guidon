"use client";

import { createContext, useContext } from "react";
import type { ProjectRole } from "@/types/project";

/**
 * Project identity and the caller's role, resolved ONCE on the server in
 * /projects/[id]/layout.tsx and handed down.
 *
 * Client pages read from here instead of issuing their own getUser() plus
 * membership lookup — that duplication is what this replaces.
 *
 * This is presentation state. It decides which buttons render, never what the
 * database permits; RLS remains the boundary.
 */

export interface ProjectAccessValue {
  userId: string;
  project: {
    id: string;
    name: string;
    slug: string | null;
    organization_id: string;
    description: string | null;
    status: string;
    visibility: string;
  };
  role: ProjectRole | null;
  canManage: boolean;
  canWrite: boolean;
  canComment: boolean;
}

const ProjectAccessContext = createContext<ProjectAccessValue | null>(null);

export function ProjectAccessProvider({
  value,
  children,
}: {
  value: ProjectAccessValue;
  children: React.ReactNode;
}) {
  return (
    <ProjectAccessContext.Provider value={value}>
      {children}
    </ProjectAccessContext.Provider>
  );
}

/**
 * Throws when used outside the project layout. That is deliberate: a project
 * page rendering without resolved access is a bug, not a state to handle.
 */
export function useProjectAccess(): ProjectAccessValue {
  const value = useContext(ProjectAccessContext);

  if (!value) {
    throw new Error(
      "useProjectAccess must be used inside /projects/[id]/layout.tsx"
    );
  }

  return value;
}
