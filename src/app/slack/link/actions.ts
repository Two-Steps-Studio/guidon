"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { linkSlackChannel } from "@/lib/data/slack-integration";
import { verifySlackLinkToken } from "@/lib/slack/link-token";

export type AttachSlackChannelState = { error: string | null };

const LINK_EXPIRED_ERROR = "This link has expired or is invalid. Run /guidon link in the Slack channel again.";
const NO_PERMISSION_ERROR = "Only owners and admins of a project can connect a Slack channel to it.";
const GENERIC_ERROR = "Could not connect the Slack channel. Please try again.";

/**
 * Confirms the project picker on /slack/link. The client sends the signed
 * token and the chosen project id only - the channel comes from the
 * re-verified token, and the caller's role is checked here and again by RLS
 * (056: owner/admin, linked_by = the caller). Success redirects to the
 * project's settings, which list the connected channels.
 */
export async function attachSlackChannelToProject(token: string, projectId: string): Promise<AttachSlackChannelState> {
  if (typeof token !== "string" || typeof projectId !== "string" || !projectId) return { error: GENERIC_ERROR };

  let result: Awaited<ReturnType<typeof linkSlackChannel>>;
  try {
    const channel = verifySlackLinkToken(token, process.env.AUTH_SECRET ?? "");
    if (!channel) return { error: LINK_EXPIRED_ERROR };

    const access = await getProjectAccess(projectId);
    if (!access || !canManageProject(access.role)) return { error: NO_PERMISSION_ERROR };

    result = await linkSlackChannel(projectId, access.userId, channel);
  } catch (error) {
    console.error("attachSlackChannelToProject failed:", error);
    return { error: GENERIC_ERROR };
  }
  if (!result.ok) return { error: result.error };

  revalidatePath(`/projects/${projectId}/settings`);
  // redirect() throws, so it stays outside the try/catch above.
  redirect(`/projects/${projectId}/settings?slackConnected=1#slack`);
}
