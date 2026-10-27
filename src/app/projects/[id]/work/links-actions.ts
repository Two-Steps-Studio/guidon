"use server";

import { createClient } from "@/lib/supabase-server";
import { dataClient } from "@/lib/data-client";
import { canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { listTaskLinks, reviewTaskLink, type ReviewDecision, type TaskLink } from "@/lib/data/task-links";
import { tr } from "@/lib/i18n/server-errors";

/** Linked commits/branches/PRs for the task dialog (Smart Linking, migration 097). */
export async function loadTaskLinks(projectId: string, taskId: string): Promise<{ links: TaskLink[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { links: [], error: await tr("You do not have access to this project.") };
  return listTaskLinks(dataClient(access.userId, { supabase: () => createClient() }), projectId, taskId);
}

/** Confirm a suggested link or mark a link as not related (owner/admin/developer; RLS decides). */
export async function reviewTaskLinkAction(projectId: string, linkId: string, decision: ReviewDecision): Promise<{ link: TaskLink | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) return { link: null, error: await tr("You do not have permission to review linked code.") };
  const result = await reviewTaskLink(dataClient(access.userId, { supabase: () => createClient() }), access.userId, projectId, linkId, decision);
  if (result.error === "not_found") return { link: null, error: await tr("This link no longer exists.") };
  if (result.error) return { link: null, error: await tr("Could not update the link.") };
  return { link: result.link, error: null };
}
