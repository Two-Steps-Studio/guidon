"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
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

/** True for a Postgres unique_violation (SQLSTATE 23505) - both node-postgres
 * errors and PostgREST error objects carry it as `.code`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
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

      await logActivity({
        userId: access.userId,
        action: "member_added",
        projectId,
        entityType: "project_member",
        entityId: userId,
        details: { role },
      });

      revalidatePath(`/projects/${projectId}/members`);
      return { member, error: null };
    } catch (error) {
      // 23505 = unique_violation - project_members_project_user_unique (026).
      if (isUniqueViolation(error)) {
        return { member: null, error: "This person is already a member of this project." };
      }
      return { member: null, error: error instanceof Error ? error.message : "Failed to add member." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId, role })
    .select("id, user_id, role, joined_at")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { member: null, error: "This person is already a member of this project." };
    }
    return { member: null, error: error.message };
  }

  await logActivity({
    userId: access.userId,
    action: "member_added",
    projectId,
    entityType: "project_member",
    entityId: userId,
    details: { role },
  });

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
      // project_id scoping plus a RETURNING/row-count check - mirrors
      // removeMember just below. Without it, a memberId that doesn't belong
      // to projectId - or one RLS itself rejected (project_members_update_admin
      // blocking an admin from touching an owner row) - silently affected
      // zero rows while this still returned success and logged a
      // "member_role_changed" activity entry for a change that never
      // happened.
      const result = await withUser(access.userId, ({ query }) =>
        query("UPDATE project_members SET role = $1 WHERE id = $2 AND project_id = $3 RETURNING id", [
          role,
          memberId,
          projectId,
        ])
      );
      if (result.rows.length === 0) {
        return { error: "This member does not belong to this project, or that role change isn't allowed." };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to change role." };
    }

    await logActivity({
      userId: access.userId,
      action: "member_role_changed",
      projectId,
      entityType: "project_member",
      entityId: memberId,
      details: { from: currentMemberRole, to: role },
    });

    revalidatePath(`/projects/${projectId}/members`);
    return { error: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("id", memberId)
    .eq("project_id", projectId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This member does not belong to this project, or that role change isn't allowed." };
  }

  await logActivity({
    userId: access.userId,
    action: "member_role_changed",
    projectId,
    entityType: "project_member",
    entityId: memberId,
    details: { from: currentMemberRole, to: role },
  });

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
      await withUser(access.userId, async ({ query }) => {
        const row = await query("SELECT user_id FROM project_members WHERE id = $1 AND project_id = $2", [
          memberId,
          projectId,
        ]);
        const userId = row.rows[0]?.user_id as string | undefined;

        // By (project_id, user_id) when known, not just this row's own id:
        // 026's UNIQUE constraint means there's normally only ever one row
        // here, but this stays correct even for a pre-migration duplicate
        // on an older self-hosted database that hasn't been cleaned up - a
        // single "remove" then can't leave a second row silently granting
        // access.
        if (userId) {
          await query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [
            projectId,
            userId,
          ]);
        } else {
          await query("DELETE FROM project_members WHERE id = $1", [memberId]);
        }

        // tasks.assignee_id only clears on ON DELETE SET NULL against a
        // deleted profiles row (001) - that's a whole account deletion, not
        // a project membership removal. Without this, a removed member
        // stays the DB-level assignee of any tasks they had (the board
        // shows them as "Unassigned" only because the UI's member lookup
        // misses); if the same person is ever re-added, those stale
        // assignments silently reappear on their plate.
        if (userId) {
          await query("UPDATE tasks SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2", [
            projectId,
            userId,
          ]);
        }
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to remove member." };
    }

    await logActivity({
      userId: access.userId,
      action: "member_removed",
      projectId,
      entityType: "project_member",
      entityId: memberId,
      details: { role: currentMemberRole },
    });

    revalidatePath(`/projects/${projectId}/members`);
    return { error: null };
  }

  const supabase = await createClient();

  const { data: memberRow } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("project_id", projectId)
    .maybeSingle();

  // Same reasoning as the direct-Postgres branch above: by (project_id,
  // user_id) when known, so a pre-026 duplicate row can't survive a "remove".
  const { error } = memberRow?.user_id
    ? await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", memberRow.user_id)
    : await supabase.from("project_members").delete().eq("id", memberId);

  if (error) return { error: error.message };

  if (memberRow?.user_id) {
    await supabase
      .from("tasks")
      .update({ assignee_id: null })
      .eq("project_id", projectId)
      .eq("assignee_id", memberRow.user_id);
  }

  await logActivity({
    userId: access.userId,
    action: "member_removed",
    projectId,
    entityType: "project_member",
    entityId: memberId,
    details: { role: currentMemberRole },
  });

  revalidatePath(`/projects/${projectId}/members`);
  return { error: null };
}
