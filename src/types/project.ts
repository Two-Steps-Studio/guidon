// ============================================
// PROJECT TYPE DEFINITIONS
// ============================================

export type ProjectStatus = "active" | "archived" | "deleted";
export type ProjectVisibility = "private" | "organization" | "public";

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  /** NOT NULL in the database, unique within the organization. */
  slug: string;
  description: string | null;
  description_markdown: string | null;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  color: string | null;
  planned_end_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  organization_id: string;
  name: string;
  slug?: string;
  description?: string;
  description_markdown?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  color?: string;
  planned_end_date?: string;
}

export interface UpdateProjectData {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  description_markdown?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  color?: string;
  planned_end_date?: string;
}

// ============================================
// ORGANIZATION TYPES
// ============================================

export type OrganizationRole = "owner" | "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  joined_at: string;
}

export interface CreateOrganizationData {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateOrganizationData {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
}

// ============================================
// PROJECT MEMBER TYPES
// ============================================

export type ProjectRole = "owner" | "admin" | "developer" | "tester" | "viewer";

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
}

export interface AddMemberData {
  project_id: string;
  user_id: string;
  role: ProjectRole;
}

export interface UpdateMemberData {
  role?: ProjectRole;
}

// ============================================
// PROJECT STATS
// ============================================

export interface ProjectStats {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  total_phases: number;
  completed_phases: number;
  total_files: number;
  total_decisions: number;
  total_memory: number;
  completion_percentage: number;
}
