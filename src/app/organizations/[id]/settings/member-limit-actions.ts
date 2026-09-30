"use server";

import { revalidatePath } from "next/cache";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { dataClient } from "@/lib/data-client";

export type MemberLimitState = { error: string | null; saved: boolean };

/** Upper bound for the form input only - the column itself just requires >= 1. */
const MAX_MEMBER_PROJECT_LIMIT = 1000;

/**
 * Sets organizations.member_project_limit (migration 049): how many of this
 * organization's projects a plain member may belong to. An empty field
 * clears it (no limit). Enforced by a trigger on project_members, so this
 * only stores the number - lowering it below someone's current count
 * removes nothing, it just blocks new memberships until they're under it.
 */
export async function saveMemberProjectLimit(
  organizationId: string,
  _prevState: MemberLimitState,
  formData: FormData
): Promise<MemberLimitState> {
  const access = await getOrgAccess(organizationId);
  // Mirrors organizations_update (001): owner/admin only.
  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to change this organization's settings.", saved: false };
  }

  const raw = formData.get("member_project_limit");
  const text = typeof raw === "string" ? raw.trim() : "";
  let limit: number | null = null;
  if (text) {
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_MEMBER_PROJECT_LIMIT) {
      return { error: `Enter a whole number from 1 to ${MAX_MEMBER_PROJECT_LIMIT}, or leave it empty for no limit.`, saved: false };
    }
    limit = parsed;
  }

  const { data, error } = await dataClient(access.userId)
    .from("organizations")
    .update({ member_project_limit: limit })
    .eq("id", organizationId)
    .select("id");

  if (error) return { error: error.message, saved: false };
  if (data.length === 0) {
    return { error: "You do not have permission to change this organization's settings.", saved: false };
  }

  revalidatePath(`/organizations/${organizationId}/settings`);
  return { error: null, saved: true };
}
