"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { createServiceClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";
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

  if (hasDirectDatabase()) {
    const result = await withServiceRole(({ query }) =>
      query("UPDATE organizations SET project_limit = $1 WHERE id = $2 RETURNING id", [newLimit, orgId])
    );
    if (result.rows.length === 0) {
      return { error: "This organization no longer exists." };
    }
  } else {
    const supabase = createServiceClient();
    const { data: updatedRows, error } = await supabase
      .from("organizations")
      .update({ project_limit: newLimit })
      .eq("id", orgId)
      .select("id");

    if (error) {
      return { error: error.message };
    }
    if (!updatedRows || updatedRows.length === 0) {
      return { error: "This organization no longer exists." };
    }
  }

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

  const UNLIMITED_SENTINEL = ORG_PROJECT_LIMIT_UNLIMITED_SENTINEL;

  if (hasDirectDatabase()) {
    const subResult = await withServiceRole(({ query }) =>
      query(
        `UPDATE subscriptions SET plan_id = $1, current_period_start = now(), cancel_at_period_end = false, updated_at = now() WHERE organization_id = $2 RETURNING id`,
        [planId, orgId]
      )
    );
    if (subResult.rows.length === 0) {
      return { error: "This organization has no subscription row to update." };
    }
    const planRow = await withServiceRole(({ query }) =>
      query("SELECT project_limit FROM plans WHERE id = $1", [planId])
    );
    const newLimit = planRow.rows[0]?.project_limit ?? UNLIMITED_SENTINEL;
    const orgResult = await withServiceRole(({ query }) =>
      query("UPDATE organizations SET project_limit = $1 WHERE id = $2 RETURNING id", [
        newLimit ?? UNLIMITED_SENTINEL,
        orgId,
      ])
    );
    if (orgResult.rows.length === 0) {
      return { error: "This organization no longer exists." };
    }
  } else {
    const supabase = createServiceClient();

    const { data: plan } = await supabase
      .from("plans")
      .select("project_limit")
      .eq("id", planId)
      .single();

    const { data: updatedSubs, error: subError } = await supabase
      .from("subscriptions")
      .update({ plan_id: planId, current_period_start: new Date().toISOString(), cancel_at_period_end: false })
      .eq("organization_id", orgId)
      .select("id");

    if (subError) return { error: subError.message };
    if (!updatedSubs || updatedSubs.length === 0) {
      return { error: "This organization has no subscription row to update." };
    }

    const { data: updatedOrgs, error: orgError } = await supabase
      .from("organizations")
      .update({ project_limit: plan?.project_limit ?? UNLIMITED_SENTINEL })
      .eq("id", orgId)
      .select("id");

    if (orgError) return { error: orgError.message };
    if (!updatedOrgs || updatedOrgs.length === 0) {
      return { error: "This organization no longer exists." };
    }
  }

  revalidatePath("/admin/organizations");
  return { error: null };
}
