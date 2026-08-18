"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import type { ProjectRole } from "@/types/project";

/**
 * Roles each actor may assign, mirroring the RLS policies exactly:
 *
 *   project_members_insert_owner : project_role = 'owner'        (any role)
 *   project_members_insert_admin : project_role = 'admin'        (not owner)
 *
 * Checked here too so the error is readable instead of a raw policy
 * violation, but RLS is still what actually enforces it.
 */
const ASSIGNABLE_BY: Record<"owner" | "admin", ProjectRole[]> = {
  owner: ["owner", "admin", "developer", "tester", "viewer"],
  admin: ["admin", "developer", "tester", "viewer"],
};

export type MemberRow = { id: string; user_id: string; role: ProjectRole; joined_at: string };
export type AddMemberResult = { member: MemberRow | null; error: string | null };
export type MemberMutationResult = { error: string | null };

function assertManager(role: ProjectRole | null): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

export async function addMember(
  projectId: string,
  userId: string,
  role: ProjectRole
): Promise<AddMemberResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !assertManager(access.role)) {
    return { member: null, error: "You do not have permission to add members." };
  }
  if (!ASSIGNABLE_BY[access.role].includes(role)) {
    return { member: null, error: "You cannot assign that role." };
  }

  if (hasDirectDatabase()) {
    try {
      const member = await withUser(access.userId, async ({ query }) => {
        const result = await query(
          `INSERT INTO project_members (project_id, user_id, role)
           VALUES ($1, $2, $3)
           RETURNING id, user_id, role, joined_at`,
          [projectId, userId, role]
        );
        return result.rows[0] as MemberRow;
      });

      revalidatePath(`/projects/${projectId}/members`);
      return { member, error: null };
    } catch (error) {
      return { member: null, error: error instanceof Error ? error.message : "Failed to add member." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId, role })
    .select("id, user_id, role, joined_at")
    .single();

  if (error) return { member: null, error: error.message };

  revalidatePath(`/projects/${projectId}/members`);
  return { member: data as MemberRow, error: null };
}

export async function changeMemberRole(
  projectId: string,
  memberId: string,
  currentMemberRole: ProjectRole,
  role: ProjectRole
): Promise<MemberMutationResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !assertManager(access.role)) {
    return { error: "You do not have permission to change roles." };
  }
  // Mirrors project_members_update_admin: an admin may not touch an owner row.
  if (access.role === "admin" && currentMemberRole === "owner") {
    return { error: "Only an owner can change another owner's role." };
  }
  if (!ASSIGNABLE_BY[access.role].includes(role)) {
    return { error: "You cannot assign that role." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("UPDATE project_members SET role = $1 WHERE id = $2", [role, memberId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to change role." };
    }

    revalidatePath(`/projects/${projectId}/members`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_members").update({ role }).eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/members`);
  return { error: null };
}

export async function removeMember(
  projectId: string,
  memberId: string,
  currentMemberRole: ProjectRole
): Promise<MemberMutationResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !assertManager(access.role)) {
    return { error: "You do not have permission to remove members." };
  }
  // Mirrors project_members_delete_admin: an admin may not remove an owner.
  if (access.role === "admin" && currentMemberRole === "owner") {
    return { error: "Only an owner can remove another owner." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("DELETE FROM project_members WHERE id = $1", [memberId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to remove member." };
    }

    revalidatePath(`/projects/${projectId}/members`);
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("project_members").delete().eq("id", memberId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/members`);
  return { error: null };
}
