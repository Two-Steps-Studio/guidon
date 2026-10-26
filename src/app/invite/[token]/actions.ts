"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { hostedMemberLimitError } from "@/lib/limits";
import { isWellFormedInvitationToken } from "@/lib/invitations";
import { tr } from "@/lib/i18n/server-errors";

export type AcceptInvitationState = { error: string | null };

/**
 * Accepts an invitation link as the signed-in user (public.accept_invitation,
 * migration 091: token, expiry and the invited address are checked in the
 * database). Guidon Cloud's seat limit is checked first - it is a plan
 * rule, not an RLS one - so a full organization says so instead of adding
 * a member over the limit.
 */
export async function acceptInvitation(token: string): Promise<AcceptInvitationState> {
  if (!isWellFormedInvitationToken(token)) return { error: await tr("This invitation link is not valid.") };
  const user = await getCurrentUser();
  const db = dataClient(user.id);

  const { data: preview } = await db.rpcRows<{ status: string; organization_id: string | null; project_id: string | null }>(
    "invitation_preview",
    { p_token: token }
  );
  const invitation = preview?.[0];
  if (!invitation) return { error: await tr("This invitation link is not valid.") };
  if (invitation.status === "pending" && invitation.organization_id && !invitation.project_id) {
    const seatsError = await hostedMemberLimitError(invitation.organization_id);
    if (seatsError) return { error: seatsError };
  }

  const { data, error } = await db.rpcRows<{ result: string; organization_id: string | null; project_id: string | null }>(
    "accept_invitation",
    { p_token: token }
  );
  const outcome = data?.[0];
  if (error || !outcome) return { error: await tr("Could not accept the invitation. Try again.") };

  switch (outcome.result) {
    case "accepted":
    case "already_member":
      break;
    case "expired":
      return { error: await tr("This invitation has expired. Ask for a new one.") };
    case "used":
      return { error: await tr("This invitation has already been used.") };
    case "email_mismatch":
      return { error: await tr("This invitation was sent to a different email address.") };
    default:
      return { error: await tr("This invitation link is not valid.") };
  }

  if (outcome.result === "accepted" && outcome.organization_id) {
    await logActivity({
      userId: user.id,
      action: "invite_accepted",
      organizationId: outcome.organization_id,
      entityType: "organization_member",
      entityId: user.id,
    });
  }
  redirect(outcome.project_id ? `/projects/${outcome.project_id}` : `/organizations/${outcome.organization_id}`);
}
