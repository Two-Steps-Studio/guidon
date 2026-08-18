import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import type { OrganizationRole } from "@/types/project";

export interface OrgAccess {
  userId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  };
  role: OrganizationRole | null;
}

const MANAGE_ROLES: OrganizationRole[] = ["owner", "admin"];

export function canManageOrg(role: OrganizationRole | null): boolean {
  return role !== null && MANAGE_ROLES.includes(role);
}

/** Same shape and same reasoning as getProjectAccess (src/lib/data/project-access.ts). */
export const getOrgAccess = cache(async function getOrgAccess(
  orgId: string
): Promise<OrgAccess | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [orgResult, membershipResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, description, created_at, updated_at")
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
