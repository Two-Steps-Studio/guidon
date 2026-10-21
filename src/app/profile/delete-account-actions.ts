"use server";

import { getCurrentUser } from "@/lib/data/current-user";
import { deleteAccount, getAccountDeletionPlan } from "@/lib/account/delete-account";
import { confirmationMatches } from "@/lib/account/account-deletion-core";
import type { DeletionPlan } from "@/lib/account/account-deletion-core";
import { tr } from "@/lib/i18n/server-errors";

export async function getMyDeletionPlan(): Promise<DeletionPlan> {
  const user = await getCurrentUser();
  return getAccountDeletionPlan(user.id);
}

/** Profile -> Delete account. The caller then signs out (the session's user no longer exists). */
export async function deleteMyAccount(confirmEmail: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!confirmationMatches(confirmEmail, user.email)) {
    return { error: await tr("Type your email address exactly to confirm.") };
  }
  const result = await deleteAccount(user.id);
  if (!result.ok) {
    const names = result.blockers.map((o) => o.name).join(", ");
    return { error: `${await tr("Make someone else owner of these organizations first:")} ${names}` };
  }
  return { error: null };
}
