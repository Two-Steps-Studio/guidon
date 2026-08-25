"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { createServiceClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";

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
    await withServiceRole(({ query }) =>
      query("UPDATE organizations SET project_limit = $1 WHERE id = $2", [newLimit, orgId])
    );
  } else {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("organizations")
      .update({ project_limit: newLimit })
      .eq("id", orgId);

    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/admin/organizations");
  return { error: null };
}

export type UpdatePlanState = {
  error: string | null;
};

/**
 * Admin-only plan change (no self-service upgrade in this phase - see
 * docs/superpowers/specs/2026-08-22-subscriptions-design.md's "Context"
 * section for why). Updates both the subscription's plan_id and
 * organizations.project_limit together, so the two stay in sync at the
 * moment of an actual plan change; project_limit remains independently
 * editable afterward via updateOrganizationProjectLimit.
 */
export async function updateOrganizationPlan(
  orgId: string,
  planId: string
): Promise<UpdatePlanState> {
  await requireAdminAccess();

  const validPlanIds = ["free", "pro", "team", "business"];
  if (!validPlanIds.includes(planId)) {
    return { error: "Unknown plan." };
  }

  const UNLIMITED_SENTINEL = 2147483647;

  if (hasDirectDatabase()) {
    await withServiceRole(({ query }) =>
      query(
        `UPDATE subscriptions SET plan_id = $1, current_period_start = now(), cancel_at_period_end = false, updated_at = now() WHERE organization_id = $2`,
        [planId, orgId]
      )
    );
    const planRow = await withServiceRole(({ query }) =>
      query("SELECT project_limit FROM plans WHERE id = $1", [planId])
    );
    const newLimit = planRow.rows[0]?.project_limit ?? UNLIMITED_SENTINEL;
    await withServiceRole(({ query }) =>
      query("UPDATE organizations SET project_limit = $1 WHERE id = $2", [
        newLimit ?? UNLIMITED_SENTINEL,
        orgId,
      ])
    );
  } else {
    const supabase = createServiceClient();

    const { data: plan } = await supabase
      .from("plans")
      .select("project_limit")
      .eq("id", planId)
      .single();

    const { error: subError } = await supabase
      .from("subscriptions")
      .update({ plan_id: planId, current_period_start: new Date().toISOString(), cancel_at_period_end: false })
      .eq("organization_id", orgId);

    if (subError) return { error: subError.message };

    const { error: orgError } = await supabase
      .from("organizations")
      .update({ project_limit: plan?.project_limit ?? UNLIMITED_SENTINEL })
      .eq("id", orgId);

    if (orgError) return { error: orgError.message };
  }

  revalidatePath("/admin/organizations");
  return { error: null };
}
