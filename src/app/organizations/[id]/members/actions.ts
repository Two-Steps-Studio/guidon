"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/organizations/${orgId}/members`);
  return { error: null };
}

export async function removeMember(
  orgId: string,
  memberId: string
): Promise<{ error: string | null }> {
  const access = await getOrgAccess(orgId);

  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to remove members." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("organization_members").delete().eq("id", memberId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/organizations/${orgId}/members`);
  return { error: null };
}
