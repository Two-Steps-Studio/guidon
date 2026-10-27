"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";

/** The author withdraws their own version (the database checks ownership). */
export async function withdrawOwnModuleVersion(moduleId: string, version: string): Promise<boolean> {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(moduleId) || !/^[0-9A-Za-z.+-]{1,128}$/.test(version)) return false;
  const user = await getCurrentUser();
  const { data, error } = await dataClient(user.id).rpc<boolean>("withdraw_module_version", { p_module_id: moduleId, p_version: version });
  if (error || data !== true) return false;
  revalidatePath("/my-modules"); revalidatePath("/marketplace");
  return true;
}
