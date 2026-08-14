import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { User } from "@supabase/supabase-js";

// ============================================
// TYPES
// ============================================

export type OrganizationRole = "owner" | "admin" | "member";
export type ProjectRole = "owner" | "admin" | "developer" | "tester" | "viewer";

export interface AuthContext {
  user: User;
  profile?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
}

// ============================================
// ERROR RESPONSES
// ============================================

const ERROR_RESPONSES = {
  UNAUTHORIZED: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  FORBIDDEN: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  SERVICE_DISABLED: NextResponse.json({ error: "Service disabled" }, { status: 503 }),
};

// ============================================
// 1. requireAuth()
// ============================================

/**
 * Checks if user is authenticated and returns AuthContext
 * @returns AuthContext or NextResponse with 401 error
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return ERROR_RESPONSES.SERVICE_DISABLED;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return ERROR_RESPONSES.UNAUTHORIZED;
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile: profile || undefined,
  };
}

// ============================================
// 2. requireOrganizationAccess()
// ============================================

/**
 * Checks if user has access to an organization
 * @param auth - AuthContext from requireAuth()
 * @param organizationId - ID of the organization
 * @param requiredRole - Minimum required role (owner, admin, member)
 * @returns NextResponse with 403 if no access, null if authorized
 */
export async function requireOrganizationAccess(
  auth: AuthContext | NextResponse,
  organizationId: string,
  requiredRole: OrganizationRole = "member"
): Promise<NextResponse | null> {
  // If auth is an error response, return it
  if (auth instanceof NextResponse) {
    return auth;
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return ERROR_RESPONSES.SERVICE_DISABLED;
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    console.error(`[SECURITY] User ${auth.user.id} attempted to access organization ${organizationId} without membership`);
    return ERROR_RESPONSES.FORBIDDEN;
  }

  // Role hierarchy: owner > admin > member
  const ROLE_HIERARCHY: Record<OrganizationRole, number> = {
    owner: 3,
    admin: 2,
    member: 1,
  };

  const userRoleLevel = ROLE_HIERARCHY[membership.role as OrganizationRole];
  const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

  if (userRoleLevel < requiredRoleLevel) {
    console.error(`[SECURITY] User ${auth.user.id} attempted to access organization ${organizationId} with role ${membership.role}, required ${requiredRole}`);
    return ERROR_RESPONSES.FORBIDDEN;
  }

  return null;
}

// ============================================
// 3. requireProjectAccess()
// ============================================

/**
 * Checks if user has access to a project
 * @param auth - AuthContext from requireAuth()
 * @param projectId - ID of the project
 * @param requiredRole - Minimum required role (owner, admin, developer, tester, viewer)
 * @returns NextResponse with 403 if no access, null if authorized
 */
export async function requireProjectAccess(
  auth: AuthContext | NextResponse,
  projectId: string,
  requiredRole: ProjectRole = "viewer"
): Promise<NextResponse | null> {
  // If auth is an error response, return it
  if (auth instanceof NextResponse) {
    return auth;
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return ERROR_RESPONSES.SERVICE_DISABLED;
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    console.error(`[SECURITY] User ${auth.user.id} attempted to access project ${projectId} without membership`);
    return ERROR_RESPONSES.FORBIDDEN;
  }

  // Role hierarchy: owner > admin > developer > tester > viewer
  const ROLE_HIERARCHY: Record<ProjectRole, number> = {
    owner: 5,
    admin: 4,
    developer: 3,
    tester: 2,
    viewer: 1,
  };

  const userRoleLevel = ROLE_HIERARCHY[membership.role as ProjectRole];
  const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

  if (userRoleLevel < requiredRoleLevel) {
    console.error(`[SECURITY] User ${auth.user.id} attempted to access project ${projectId} with role ${membership.role}, required ${requiredRole}`);
    return ERROR_RESPONSES.FORBIDDEN;
  }

  return null;
}

// ============================================
// 4. requireProjectPermission()
// ============================================

/**
 * Checks if user has a specific permission on a project
 * @param auth - AuthContext from requireAuth()
 * @param projectId - ID of the project
 * @param permission - Required permission
 * @returns NextResponse with 403 if no permission, null if authorized
 */
export async function requireProjectPermission(
  auth: AuthContext | NextResponse,
  projectId: string,
  permission: ProjectPermission
): Promise<NextResponse | null> {
  // If auth is an error response, return it
  if (auth instanceof NextResponse) {
    return auth;
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return ERROR_RESPONSES.SERVICE_DISABLED;
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership) {
    return ERROR_RESPONSES.FORBIDDEN;
  }

  const role = membership.role as ProjectRole;
  const hasPermission = PERMISSIONS[permission].includes(role);

  if (!hasPermission) {
    console.error(`[SECURITY] User ${auth.user.id} attempted to use permission ${permission} on project ${projectId} with role ${role}`);
    return ERROR_RESPONSES.FORBIDDEN;
  }

  return null;
}

// ============================================
// PERMISSION MAPPING
// ============================================

export type ProjectPermission =
  | "view_project"
  | "edit_project"
  | "manage_tasks"
  | "manage_roadmap"
  | "manage_files"
  | "manage_members"
  | "manage_decisions"
  | "manage_relations"
  | "manage_sources"
  | "manage_memory"
  | "verify_memory"
  | "manage_settings"
  | "delete_project";

const PERMISSIONS: Record<ProjectPermission, ProjectRole[]> = {
  view_project: ["owner", "admin", "developer", "tester", "viewer"],
  edit_project: ["owner", "admin"],
  manage_tasks: ["owner", "admin", "developer"],
  manage_roadmap: ["owner", "admin"],
  manage_files: ["owner", "admin", "developer"],
  manage_members: ["owner", "admin"],
  manage_decisions: ["owner", "admin", "developer"],
  manage_relations: ["owner", "admin", "developer"],
  manage_sources: ["owner", "admin", "developer"],
  manage_memory: ["owner", "admin", "developer"],
  verify_memory: ["owner", "admin"],
  manage_settings: ["owner", "admin"],
  delete_project: ["owner"],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Checks if auth result is an error response
 */
export function isAuthError(auth: AuthContext | NextResponse): auth is NextResponse {
  return auth instanceof NextResponse;
}

/**
 * Safely extracts user from auth context
 */
export function getUser(auth: AuthContext | NextResponse): User | null {
  if (isAuthError(auth)) return null;
  return auth.user;
}

/**
 * Safely extracts user ID from auth context
 */
export function getUserId(auth: AuthContext | NextResponse): string | null {
  const user = getUser(auth);
  return user?.id || null;
}
