"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL } from "./constants";

export type UpdateProjectLimitState = {
  error: string | null;
};

/**
 * The only legal way to change organizations.project_limit (migration 014
 * revokes column-level UPDATE from `authenticated`, leaving only
 * service_role able to write it). Gated by requireAdminAccess() the same
 * way every other /admin route and action in this codebase is.
 */
export async function updateOrganizationProjectLimit(
  orgId: string,
  newLimit: number
): Promise<UpdateProjectLimitState> {
  await requireAdminAccess();

  if (!Number.isInteger(newLimit) || newLimit < 1) {
    return { error: "Project limit must be a whole number of 1 or more." };
  }

  const { data: updated, error } = await serviceDataClient()
    .from("organizations")
    .update({ project_limit: newLimit })
    .eq("id", orgId)
    .select("id");
  if (error) return { error: error.message };
  if (updated.length === 0) return { error: "This organization no longer exists." };

  revalidatePath("/admin/organizations");
  return { error: null };
}

export type UpdatePlanState = {
  error: string | null;
};

/**
 * Admin-only plan change - kept as an escape hatch (comping an account,
 * handling a dispute) now that self-serve Checkout/the Customer Portal
 * exist (src/app/organizations/[id]/billing/actions.ts). Updates both the
 * subscription's plan_id and organizations.project_limit together, so the
 * two stay in sync at the moment of an actual plan change; project_limit
 * remains independently editable afterward via updateOrganizationProjectLimit.
 *
 * Does NOT touch Stripe. If the organization has a real, still-active
 * Stripe subscription, the next customer.subscription.updated webhook
 * (src/app/api/stripe/webhook/route.ts) overwrites plan_id/project_limit
 * back to whatever Stripe actually has - this is only a clean override for
 * an organization with no live Stripe subscription (Free, or one you've
 * separately canceled/paused in the Stripe Dashboard).
 */
export async function updateOrganizationPlan(
  orgId: string,
  planId: string
): Promise<UpdatePlanState> {
  await requireAdminAccess();

  const validPlanIds = ["free", "pro", "team", "business", "enterprise"];
  if (!validPlanIds.includes(planId)) {
    return { error: "Unknown plan." };
  }

  const db = serviceDataClient();

  const { data: plan } = await db
    .from<{ project_limit: number | null }>("plans")
    .select("project_limit")
    .eq("id", planId)
    .maybeSingle();

  // organizations.project_limit is NOT NULL (014), so an unlimited plan
  // (NULL in plans) is stored as the sentinel - see ./constants.ts. First,
  // so a vanished organization stops here instead of failing the
  // subscription insert below on its foreign key.
  const { data: updatedOrgs, error: orgError } = await db
    .from("organizations")
    .update({ project_limit: plan?.project_limit ?? ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL })
    .eq("id", orgId)
    .select("id");
  if (orgError) return { error: orgError.message };
  if (updatedOrgs.length === 0) return { error: "This organization no longer exists." };

  // upsertRow, not a plain update: organizations created before migration
  // 015 never got a subscription row (015's trigger only covers new ones,
  // 052 backfills them), and the admin panel is exactly where you'd go to
  // fix that - "no subscription row to update" was a dead end.
  const now = new Date().toISOString();
  const { error: subError } = await db.upsertRow("subscriptions", {
    key: { organization_id: orgId },
    set: { plan_id: planId, current_period_start: now, cancel_at_period_end: false, updated_at: now },
  });
  if (subError) return { error: subError.message };

  revalidatePath("/admin/organizations");
  return { error: null };
}
