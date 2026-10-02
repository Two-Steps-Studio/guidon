"use server";

import { revalidatePath } from "next/cache";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { dataClient, serviceDataClient } from "@/lib/data-client";
import { isUniqueViolation } from "@/lib/db/errors";
import { logActivity } from "@/lib/data/log-activity";
import { hostedMemberLimitError } from "@/lib/limits";
import type { OrganizationRole } from "@/types/project";

export type MemberActionState = {
  error: string | null;
};

const NOT_IN_ORG = "This member does not belong to this organization, or that change isn't allowed.";

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
  // Every signup path (local-auth.ts, GoTrue) lowercases before storing, so
  // profiles.email is always lowercase - comparing against the raw,
  // as-typed input made "John@Example.com" miss "john@example.com".
  const normalizedEmail = email.trim().toLowerCase();
  if (role !== "member" && role !== "admin" && role !== "owner") {
    return { error: "Invalid role." };
  }
  // Mirrors the RLS policies (001): an admin may not grant ownership, only
  // an owner can. Checked here too so the error is readable.
  if (role === "owner" && access.role !== "owner") {
    return { error: "Only an owner can grant ownership." };
  }

  // Guidon Cloud seats (plans.member_limit, 051). Checked before the lookup
  // so a full organization gets the upgrade message rather than "not
  // found" for a mistyped address.
  const seatsError = await hostedMemberLimitError(orgId);
  if (seatsError) return { error: seatsError };

  const db = dataClient(access.userId);

  // Not a plain SELECT on profiles: its RLS (003) only shows people who
  // already share an organization/project with the caller - never the
  // person being added. See migration 047.
  const { data: userId } = await db.rpc<string>("find_user_id_by_email", {
    p_organization_id: orgId,
    p_email: normalizedEmail,
  });
  if (!userId) return { error: "User with this email not found." };

  const { error } = await db.from("organization_members").insert({ organization_id: orgId, user_id: userId, role });
  if (error) {
    // uq_organization_members_org_user (001/026).
    if (isUniqueViolation(error)) return { error: "This person is already a member of this organization." };
    return { error: error.message };
  }

  await logActivity({
    userId: access.userId,
    action: "member_added",
    organizationId: orgId,
    entityType: "organization_member",
    entityId: userId,
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

  // organization_id scoping plus a row check: a memberId from another
  // organization - or one RLS rejected (an admin changing an owner's role,
  // blocked by organization_members_update_admin) - used to "succeed" with
  // zero rows and still log a role change that never happened.
  const { data, error } = await dataClient(access.userId)
    .from("organization_members")
    .update({ role })
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .select("id");

  if (error) return { error: error.message };
  if (data.length === 0) return { error: NOT_IN_ORG };

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
 * cascade - and its DELETE policy belongs to each project's own
 * owner/admin, not org admins in general. Without this, someone removed
 * from the organization kept full access to every project they'd been
 * added to, since the org admin doing the removal often isn't an admin of
 * all of them and a delete under their identity would no-op under RLS.
 * Also clears tasks.assignee_id in those projects (ON DELETE SET NULL only
 * fires for a deleted profile), or the person would stay the assignee and
 * the assignment would reappear if they were re-added.
 *
 * Service role: canManageOrg() already established the caller may remove
 * this person from the organization, and this is the direct, scoped
 * consequence - only this user, only this organization's projects.
 */
async function removeUserFromOrgProjects(userId: string, orgId: string): Promise<void> {
  const service = serviceDataClient();
  const { data: projects } = await service.from<{ id: string }>("projects").select("id").eq("organization_id", orgId);
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) return;

  await service.from("project_members").delete().eq("user_id", userId).in("project_id", projectIds);
  await service.from("tasks").update({ assignee_id: null }).eq("assignee_id", userId).in("project_id", projectIds);
}

export async function removeMember(orgId: string, memberId: string): Promise<{ error: string | null }> {
  const access = await getOrgAccess(orgId);

  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to remove members." };
  }

  const db = dataClient(access.userId);
  const { data: member } = await db
    .from<{ user_id: string }>("organization_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  // By (organization_id, user_id) when known, not just this row's id, so a
  // pre-026 duplicate row can't survive a "remove" and keep granting
  // access; scoped to organization_id either way, with a row check so a
  // foreign or RLS-blocked memberId isn't logged as removed.
  const remove = db.from("organization_members").delete().eq("organization_id", orgId);
  const { data: deleted, error } = member
    ? await remove.eq("user_id", member.user_id).select("id")
    : await remove.eq("id", memberId).select("id");

  if (error) return { error: error.message };
  if (deleted.length === 0) return { error: NOT_IN_ORG };

  if (member) await removeUserFromOrgProjects(member.user_id, orgId);

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
