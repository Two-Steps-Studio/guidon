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
