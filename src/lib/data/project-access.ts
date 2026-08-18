import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import type { ProjectRole } from "@/types/project";

/**
 * Server-side project authorisation — one gate for every project page.
 *
 * Before this existed, each of the 11 project pages ran its own
 * getUser() + membership lookup, and 7 of them did not check the role at all;
 * they simply let RLS reject the query and surfaced the raw Postgres error.
 * That is both duplicated work and an inconsistent user experience
 * (TODO.md §33, §38).
 *
 * RLS remains the real boundary. This layer exists so the UI can answer
 * "what may this person do here" once, on the server, before rendering.
 */

export interface ProjectAccess {
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
  /** Null when the user can see the project but is not a member of it —
   *  possible for `organization` and `public` visibility. */
  role: ProjectRole | null;
}

const MANAGE_ROLES: ProjectRole[] = ["owner", "admin"];
const WRITE_ROLES: ProjectRole[] = ["owner", "admin", "developer"];
const COMMENT_ROLES: ProjectRole[] = ["owner", "admin", "developer", "tester"];

export function canManageProject(role: ProjectRole | null): boolean {
  return role !== null && MANAGE_ROLES.includes(role);
}

export function canWriteProject(role: ProjectRole | null): boolean {
  return role !== null && WRITE_ROLES.includes(role);
}

export function canCommentOnProject(role: ProjectRole | null): boolean {
  return role !== null && COMMENT_ROLES.includes(role);
}

/**
 * Resolve the caller's access to a project.
 *
 * Returns null rather than throwing when the project is invisible, so callers
 * can decide between "not found" and "sign in" — RLS makes those two cases
 * indistinguishable at the query level, and leaking the difference would tell
 * an outsider which project ids exist.
 */
/**
 * Wrapped in React's `cache()` because the layout resolves access once for
 * generateMetadata and once more for the render itself — same request, same
 * answer. Without this every project page paid for that query twice before
 * even starting its own work.
 */
export const getProjectAccess = cache(async function getProjectAccess(
  projectId: string
): Promise<ProjectAccess | null> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return null;

    const [projectResult, membershipResult] = await withUser(userId, ({ query }) =>
      Promise.all([
        query(
          `SELECT id, name, slug, organization_id, description, status, visibility
           FROM projects WHERE id = $1`,
          [projectId]
        ),
        query("SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2", [
          projectId,
          userId,
        ]),
      ])
    );

    if (projectResult.rows.length === 0) return null;

    return {
      userId,
      project: projectResult.rows[0],
      role: (membershipResult.rows[0]?.role as ProjectRole) ?? null,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [projectResult, membershipResult] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, slug, organization_id, description, status, visibility"
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // RLS already filtered this: no row means no access, whatever the reason.
  if (projectResult.error || !projectResult.data) return null;

  return {
    userId: user.id,
    project: projectResult.data,
    role: (membershipResult.data?.role as ProjectRole) ?? null,
  };
});

/**
 * Same as getProjectAccess, but sends the caller somewhere sensible instead of
 * returning null: unauthenticated users to sign-in with a return path, and
 * everyone else to the project list.
 *
 * Use this in layouts and pages; use getProjectAccess when the caller wants to
 * render its own empty state.
 */
export async function requireProjectAccess(
  projectId: string
): Promise<ProjectAccess> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) {
      redirect(`/auth/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
    }

    const access = await getProjectAccess(projectId);
    if (!access) {
      redirect("/projects?error=no-access");
    }
    return access;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
  }

  const access = await getProjectAccess(projectId);

  if (!access) {
    redirect("/projects?error=no-access");
  }

  return access;
}

export interface SwitchableProject {
  id: string;
  name: string;
  slug: string | null;
}

/**
 * Projects the caller may switch to from the project sidebar, scoped to the
 * current project's organization (a global list across every org the user
 * belongs to would mix unrelated workspaces into one dropdown).
 *
 * No separate membership check here: `projects_select` RLS
 * (001_initial_schema.sql) already applies `private.project_access(id)` —
 * same visibility rule as everywhere else — so this returns exactly what the
 * caller is allowed to see, same guarantee as the `projects` page.
 */
export async function getSwitchableProjects(
  organizationId: string
): Promise<SwitchableProject[]> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return [];

    const result = await withUser(userId, ({ query }) =>
      query("SELECT id, name, slug FROM projects WHERE organization_id = $1 ORDER BY name ASC", [
        organizationId,
      ])
    );
    return result.rows;
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  return (data ?? []) as SwitchableProject[];
}
