"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/current-user";
import { listConnectedApps, revokeConnectedApp, type ConnectedApp } from "@/lib/oauth/oauth";
import { tr } from "@/lib/i18n/server-errors";

/** The apps connected through OAuth (migration 073); empty before that migration. */
export async function getConnectedApps(): Promise<ConnectedApp[]> {
  const user = await getCurrentUser();
  try {
    return await listConnectedApps(user.id);
  } catch {
    return [];
  }
}

export async function disconnectApp(grantId: string): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  const done = await revokeConnectedApp(user.id, grantId);
  if (!done) return { error: await tr("That app isn't connected.") };
  revalidatePath("/profile");
  return { error: null };
}
