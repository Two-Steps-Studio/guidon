/**
 * Guidon Permission System
 * 
 * This module provides permission checking utilities for Guidon.
 * It integrates with the auth-helpers to provide role-based access control.
 */

import { ProjectRole, OrganizationRole } from "@/lib/auth/auth-helpers";

// ============================================
// PROJECT PERMISSIONS
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

/**
 * Permission mapping: which roles have which permissions
 */
export const PROJECT_PERMISSIONS: Record<ProjectPermission, ProjectRole[]> = {
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

/**
 * Check if a role has a specific permission
 */
export function hasProjectPermission(role: ProjectRole, permission: ProjectPermission): boolean {
  return PROJECT_PERMISSIONS[permission].includes(role);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: ProjectRole): ProjectPermission[] {
  return Object.entries(PROJECT_PERMISSIONS)
    .filter(([_, roles]) => roles.includes(role))
    .map(([permission]) => permission as ProjectPermission);
}

// ============================================
// ORGANIZATION PERMISSIONS
// ============================================

export type OrganizationPermission =
  | "view_organization"
  | "edit_organization"
  | "manage_members"
  | "manage_projects"
  | "delete_organization";

export const ORGANIZATION_PERMISSIONS: Record<OrganizationPermission, OrganizationRole[]> = {
  view_organization: ["owner", "admin", "member"],
  edit_organization: ["owner", "admin"],
  manage_members: ["owner", "admin"],
  manage_projects: ["owner", "admin"],
  delete_organization: ["owner"],
};

/**
 * Check if a role has a specific organization permission
 */
export function hasOrganizationPermission(role: OrganizationRole, permission: OrganizationPermission): boolean {
  return ORGANIZATION_PERMISSIONS[permission].includes(role);
}

// ============================================
// ROLE HIERARCHY
// ============================================

/**
 * Project role hierarchy (higher number = more permissions)
 */
export const PROJECT_ROLE_HIERARCHY: Record<ProjectRole, number> = {
  owner: 5,
  admin: 4,
  developer: 3,
  tester: 2,
  viewer: 1,
};

/**
 * Organization role hierarchy (higher number = more permissions)
 */
export const ORGANIZATION_ROLE_HIERARCHY: Record<OrganizationRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/**
 * Check if a role meets or exceeds the minimum required role level
 */
export function meetsMinimumRole(role: ProjectRole | OrganizationRole, minimumRole: ProjectRole | OrganizationRole): boolean {
  const hierarchy = role in PROJECT_ROLE_HIERARCHY ? PROJECT_ROLE_HIERARCHY : ORGANIZATION_ROLE_HIERARCHY;
  const roleLevel = hierarchy[role as keyof typeof hierarchy];
  const minLevel = hierarchy[minimumRole as keyof typeof hierarchy];
  return roleLevel >= minLevel;
}

// ============================================
// PERMISSION VALIDATION
// ============================================

/**
 * Validate that a user has all required permissions
 */
export function validatePermissions(
  role: ProjectRole,
  permissions: ProjectPermission[]
): { valid: boolean; missing: ProjectPermission[] } {
  const missing = permissions.filter(p => !hasProjectPermission(role, p));
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Check if user can perform an action based on their role
 */
export function canPerformAction(role: ProjectRole, action: ProjectPermission): boolean {
  return hasProjectPermission(role, action);
}
