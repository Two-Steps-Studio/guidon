"use server";

import { clearLocalSession } from "@/lib/auth/local-auth";

export async function logoutLocalAction(): Promise<void> {
  await clearLocalSession();
}
