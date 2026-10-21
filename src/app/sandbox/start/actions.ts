"use server";

import { redirect } from "next/navigation";
import { dataClient } from "@/lib/data-client";
import { getCurrentUser } from "@/lib/data/current-user";
import { ensureSandbox } from "@/lib/api/sandbox";

/** Creates the signed-in user's sandbox (or resets it) and opens its board. */
export async function openSandbox(formData: FormData) {
  const user = await getCurrentUser();
  const sandbox = await ensureSandbox(dataClient(user.id), user.id, formData.get("reset") === "true");
  redirect(`/projects/${sandbox.project_id}/work`);
}
