"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser, withServiceRole } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import type { OrganizationRole } from "@/types/project";

export type MemberActionState = {
  error: string | null;
};

export async function addMember(
  orgId: string,
  _prevState: MemberActionState,
  formData: FormData
): Promise<MemberActionState> {
  const access = await getOrgAccess(orgId);

  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to add members." };
  }

  const email = formData.get("email");
  const role = formData.get("role");

  if (typeof email !== "string" || !email.trim()) {
    return { error: "Email is required." };
  }
  if (role !== "member" && role !== "admin" && role !== "owner") {
    return { error: "Invalid role." };
  }
  // Mirrors the RLS policies (001): an admin may not grant ownership,
  // only an owner can. Checked here too so the error is readable instead
  // of a raw Postgres RLS rejection.
  if (role === "owner" && access.role !== "owner") {
    return { error: "Only an owner can grant ownership." };
  }

  if (hasDirectDatabase()) {
    let addedUserId: string;

    try {
      addedUserId = await withUser(access.userId, async ({ query }) => {
        const profileResult = await query("SELECT id FROM profiles WHERE email = $1", [
          email.trim(),
        ]);
        if (profileResult.rows.length === 0) {
          throw new Error("User with this email not found.");
        }

        await query(
          "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)",
          [orgId, profileResult.rows[0].id, role]
        );
        return profileResult.rows[0].id as string;
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to add member." };
    }

    await logActivity({
      userId: access.userId,
      action: "member_added",
      organizationId: orgId,
      entityType: "organization_member",
      entityId: addedUserId,
      details: { role },
    });

    revalidatePath(`/organizations/${orgId}/members`);
    return { error: null };
  }

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.trim())
    .maybeSingle();

  if (profileError || !profile) {
    return { error: "User with this email not found." };
  }

  const { error } = await supabase.from("organization_members").insert({
    organization_id: orgId,
    user_id: profile.id,
    role,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    userId: access.userId,
    action: "member_added",
    organizationId: orgId,
    entityType: "organization_member",
    entityId: profile.id,
    details: { role },
  });

  revalidatePath(`/organizations/${orgId}/members`);
  return { error: null };
}

export async function updateMemberRole(
  orgId: string,
  memberId: string,
  role: OrganizationRole
): Promise<{ error: string | null }> {
  const access = await getOrgAccess(orgId);

  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to change roles." };
  }
  if (role === "owner" && access.role !== "owner") {
    return { error: "Only an owner can grant ownership." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("UPDATE organization_members SET role = $1 WHERE id = $2", [role, memberId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to change role." };
    }

    await logActivity({
      userId: access.userId,
      action: "member_role_changed",
      organizationId: orgId,
      entityType: "organization_member",
      entityId: memberId,
      details: { to: role },
    });

    revalidatePath(`/organizations/${orgId}/members`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId);

  if (error) {
    return { error: error.message };
  }

  await logActivity({
    userId: access.userId,
    action: "member_role_changed",
    organizationId: orgId,
    entityType: "organization_member",
    entityId: memberId,
    details: { to: role },
  });

  revalidatePath(`/organizations/${orgId}/members`);
  return { error: null };
}

/**
 * project_members has no dependency on organization_members - no FK, no
 * cascade trigger - and RLS scopes its DELETE policy to that specific
 * project's own owner/admin (private.project_role(project_id)), not org
 * admins in general. Without this, removing someone from the organization
 * left them with full, indefinite access to any project they'd been added
 * to directly (the only way project_members ever gets a row - see
 * projects/[id]/members/page.tsx's candidate list, which is drawn from
 * organization_members), silently, since the org admin doing the removal
 * often isn't also an admin of every one of that person's projects and the
 * app-identity delete above would just no-op there under RLS.
 *
 * Runs as service_role rather than the calling org admin's own identity:
 * canManageOrg() above already establishes they're authorized to decide
 * this person loses access to the organization, and revoking the project
 * access that access implies is a direct, scoped consequence of that
 * decision (only this exact user, only within this exact org's projects) -
 * not a broader RLS bypass.
 *
 * Also clears tasks.assignee_id for the same user across those same
 * projects - same reasoning as the project_members cleanup above: nothing
 * else ever does this (ON DELETE SET NULL on tasks.assignee_id only fires
 * for a deleted profiles row, not a removed membership), so without it a
 * removed member stays the assignee of their tasks indefinitely, and the
 * assignment silently reappears if they're ever re-added.
 */
async function removeUserFromOrgProjects(userId: string, orgId: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withServiceRole(async ({ query }) => {
      await query(
        `DELETE FROM project_members
         WHERE user_id = $1 AND project_id IN (SELECT id FROM projects WHERE organization_id = $2)`,
        [userId, orgId]
      );
      await query(
        `UPDATE tasks SET assignee_id = NULL
         WHERE assignee_id = $1 AND project_id IN (SELECT id FROM projects WHERE organization_id = $2)`,
        [userId, orgId]
      );
    });
    return;
  }

  const supabase = createServiceClient();
  const { data: projects } = await supabase.from("projects").select("id").eq("organization_id", orgId);
  const projectIds = (projects ?? []).map((p) => p.id);
  if (projectIds.length === 0) return;

  await supabase.from("project_members").delete().eq("user_id", userId).in("project_id", projectIds);
  await supabase
    .from("tasks")
    .update({ assignee_id: null })
    .eq("assignee_id", userId)
    .in("project_id", projectIds);
}

export async function removeMember(
  orgId: string,
  memberId: string
): Promise<{ error: string | null }> {
  const access = await getOrgAccess(orgId);

  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to remove members." };
  }

  if (hasDirectDatabase()) {
    let userId: string | null = null;
    try {
      await withUser(access.userId, async ({ query }) => {
        const row = await query(
          "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2",
          [memberId, orgId]
        );
        userId = row.rows[0]?.user_id ?? null;
        await query("DELETE FROM organization_members WHERE id = $1", [memberId]);
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to remove member." };
    }

    if (userId) await removeUserFromOrgProjects(userId, orgId);

    await logActivity({
      userId: access.userId,
      action: "member_removed",
      organizationId: orgId,
      entityType: "organization_member",
      entityId: memberId,
    });

    revalidatePath(`/organizations/${orgId}/members`);
    return { error: null };
  }

  const supabase = await createClient();

  const { data: memberRow } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const { error } = await supabase.from("organization_members").delete().eq("id", memberId);

  if (error) {
    return { error: error.message };
  }

  if (memberRow?.user_id) await removeUserFromOrgProjects(memberRow.user_id, orgId);

  await logActivity({
    userId: access.userId,
    action: "member_removed",
    organizationId: orgId,
    entityType: "organization_member",
    entityId: memberId,
  });

  revalidatePath(`/organizations/${orgId}/members`);
  return { error: null };
}
