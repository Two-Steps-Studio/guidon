import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
import type { OrganizationRole } from "@/types/project";

export interface OrgAccess {
  userId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    avatar_url: string | null;
    project_limit: number;
    created_at: string;
    updated_at: string;
  };
  role: OrganizationRole | null;
}

const MANAGE_ROLES: OrganizationRole[] = ["owner", "admin"];

export function canManageOrg(role: OrganizationRole | null): boolean {
  return role !== null && MANAGE_ROLES.includes(role);
}

/**
 * Same shape and same reasoning as getProjectAccess (src/lib/data/project-access.ts).
 *
 * Branches on hasDirectDatabase() the same way getCurrentUser() does - see
 * src/lib/data/current-user.ts for the fuller explanation. Two separate
 * withUser() calls, not one withUser() wrapping Promise.all([query, query])
 * - each withUser() checks out its own pooled connection, so this is
 * genuinely concurrent. Firing two queries on one client is what triggers
 * pg's "Calling client.query() when the client is already executing a
 * query" deprecation warning (removed in pg@9) - a previous version of this
 * comment claimed the single-client shape was safe because node-postgres
 * queues concurrent calls internally, which is true today but is exactly
 * the deprecated behavior; dashboard/page.tsx (the pattern this cited) has
 * since been fixed the same way.
 */
export const getOrgAccess = cache(async function getOrgAccess(
  orgId: string
): Promise<OrgAccess | null> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return null;

    const [orgResult, membershipResult] = await Promise.all([
      withUser(userId, ({ query }) =>
        query(
          "SELECT id, name, slug, description, avatar_url, project_limit, created_at, updated_at FROM organizations WHERE id = $1",
          [orgId]
        )
      ),
      withUser(userId, ({ query }) =>
        query(
          "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
          [orgId, userId]
        )
      ),
    ]);

    if (orgResult.rows.length === 0) return null;

    return {
      userId,
      organization: orgResult.rows[0],
      role: (membershipResult.rows[0]?.role as OrganizationRole) ?? null,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [orgResult, membershipResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, description, avatar_url, project_limit, created_at, updated_at")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (orgResult.error || !orgResult.data) return null;

  return {
    userId: user.id,
    organization: orgResult.data,
    role: (membershipResult.data?.role as OrganizationRole) ?? null,
  };
});

export async function requireOrgAccess(orgId: string): Promise<OrgAccess> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) {
      redirect(`/auth/login?redirect=${encodeURIComponent(`/organizations/${orgId}`)}`);
    }

    const access = await getOrgAccess(orgId);
    if (!access) {
      redirect("/organizations?error=no-access");
    }
    return access;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/organizations/${orgId}`)}`);
  }

  const access = await getOrgAccess(orgId);

  if (!access) {
    redirect("/organizations?error=no-access");
  }

  return access;
}
