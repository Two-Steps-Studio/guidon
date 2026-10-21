import "server-only";

import { serviceDataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { planAccountDeletion, type DeletionPlan, type MembershipFacts } from "./account-deletion-core";

/**
 * Deleting an account (App Store guideline 5.1.1(v), GDPR art. 17).
 * Service role: it acts across organizations the person can't otherwise
 * delete through RLS, so every step re-derives what is theirs from their
 * own memberships - never from input.
 *
 * Deleting the auth user takes the rest with it (migrations' FKs): profile,
 * memberships, API keys, OAuth grants, notifications, their comments and
 * attempts; work they created in shared projects stays, unattributed
 * (created_by / assignee_id are SET NULL).
 */

interface MemberRow {
  organization_id: string;
  user_id: string;
  role: string;
}

async function membershipFacts(userId: string): Promise<{ facts: MembershipFacts[]; aiUsersByOrg: Map<string, string[]> }> {
  const db = serviceDataClient();
  const { data: mine } = await db.from<MemberRow>("organization_members").select("organization_id, user_id, role").eq("user_id", userId);
  const orgIds = (mine ?? []).map((m) => m.organization_id);
  if (orgIds.length === 0) return { facts: [], aiUsersByOrg: new Map() };

  const [{ data: members }, { data: orgs }, { data: aiAccounts }] = await Promise.all([
    db.from<MemberRow>("organization_members").select("organization_id, user_id, role").in("organization_id", orgIds),
    db.from<{ id: string; name: string }>("organizations").select("id, name").in("id", orgIds),
    db.from<{ user_id: string; organization_id: string }>("ai_accounts").select("user_id, organization_id").in("organization_id", orgIds),
  ]);

  const aiUsersByOrg = new Map<string, string[]>();
  for (const ai of aiAccounts ?? []) aiUsersByOrg.set(ai.organization_id, [...(aiUsersByOrg.get(ai.organization_id) ?? []), ai.user_id]);
  const aiUsers = new Set((aiAccounts ?? []).map((ai) => ai.user_id));

  const facts = (mine ?? []).map((m) => {
    const others = (members ?? []).filter((x) => x.organization_id === m.organization_id && x.user_id !== userId && !aiUsers.has(x.user_id));
    return {
      organizationId: m.organization_id,
      organizationName: (orgs ?? []).find((o) => o.id === m.organization_id)?.name ?? "Organization",
      role: m.role,
      otherPeople: others.length,
      otherOwners: others.filter((x) => x.role === "owner").length,
    };
  });
  return { facts, aiUsersByOrg };
}

export async function getAccountDeletionPlan(userId: string): Promise<DeletionPlan> {
  return planAccountDeletion((await membershipFacts(userId)).facts);
}

async function deleteAuthUser(userId: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withServiceRole(({ query }) => query("DELETE FROM auth.users WHERE id = $1", [userId]));
    return;
  }
  const { createServiceClient } = await import("@/lib/supabase-server");
  const { error } = await createServiceClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

/** A paid subscription of an organization being deleted stops billing now, not at the period's end. */
async function cancelSubscription(organizationId: string): Promise<void> {
  if (hasDirectDatabase() || !isBillingConfigured()) return;
  const { data } = await serviceDataClient()
    .from<{ stripe_subscription_id: string | null; status: string }>("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data?.stripe_subscription_id || data.status === "canceled") return;
  try {
    await getStripe().subscriptions.cancel(data.stripe_subscription_id);
  } catch (error) {
    // Already gone in Stripe, most likely - nothing left to bill.
    console.error("[delete-account] Stripe cancel failed for", organizationId, error);
  }
}

export type DeleteAccountResult = { ok: true; deletedOrganizations: number } | { ok: false; blockers: DeletionPlan["blockers"] };

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const { facts, aiUsersByOrg } = await membershipFacts(userId);
  const plan = planAccountDeletion(facts);
  if (plan.blockers.length) return { ok: false, blockers: plan.blockers };

  const db = serviceDataClient();
  for (const org of plan.deleteOrganizations) {
    await cancelSubscription(org.id);
    const { error } = await db.from("organizations").delete().eq("id", org.id);
    if (error) throw new Error(`Could not delete the organization ${org.name}: ${error.message}`);
    // Its AI accounts are users too; with the organization gone they belong to no one.
    for (const aiUserId of aiUsersByOrg.get(org.id) ?? []) await deleteAuthUser(aiUserId);
  }
  await deleteAuthUser(userId);
  return { ok: true, deletedOrganizations: plan.deleteOrganizations.length };
}
