"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { unlinkSlackChannel } from "@/lib/data/slack-integration";

/** Disconnects one Slack channel from the project (owner/admin; RLS re-checks). */
export async function disconnectSlackChannel(projectId: string, linkId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "Only owners and admins can disconnect a Slack channel." };
  }
  try {
    const removed = await unlinkSlackChannel(linkId, projectId, access.userId);
    if (!removed) return { error: "This channel was already disconnected." };
  } catch (error) {
    console.error("disconnectSlackChannel failed:", error);
    return { error: "Could not disconnect the channel. Try again." };
  }
  revalidatePath(`/projects/${projectId}/settings`);
  return { error: null };
}
