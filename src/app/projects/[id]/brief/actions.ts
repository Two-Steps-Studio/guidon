"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { tr } from "@/lib/i18n/server-errors";
import { getBriefVersion, loadBriefInput, type AgentBriefVersion } from "@/lib/data/agent-brief";
import { BRIEF_MAX_CHARS, generateBrief, markUnsourcedClaims } from "@/lib/context/agent-brief-core";

/** A fresh draft from the project's current data - nothing is saved. */
export async function generateBriefDraft(projectId: string): Promise<{ draft: string | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { draft: null, error: await tr("Only project owners and admins can approve the agent brief.") };
  const input = await loadBriefInput(dataClient(access.userId), projectId);
  if (!input) return { draft: null, error: await tr("You do not have access to this project.") };
  return { draft: generateBrief(input), error: null };
}

/**
 * Saves the edited brief as the next version (owner/admin). Lines a person
 * typed without a source are marked as added by hand in that version first,
 * so agents can tell them from claims backed by the project's data.
 */
export async function approveBrief(projectId: string, content: string): Promise<{ version: AgentBriefVersion | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { version: null, error: await tr("Only project owners and admins can approve the agent brief.") };
  const trimmed = content.trim();
  if (!trimmed) return { version: null, error: await tr("The brief is empty.") };
  if (trimmed.length > BRIEF_MAX_CHARS) return { version: null, error: await tr("The brief is too long.") };

  const db = dataClient(access.userId);
  const latest = await getBriefVersion(db, projectId);
  const { data, error } = await db.rpcRows<AgentBriefVersion>("save_agent_brief", {
    p_project_id: projectId,
    p_content: markUnsourcedClaims(trimmed, (latest?.version ?? 0) + 1).slice(0, BRIEF_MAX_CHARS),
  });
  if (error || !data[0]) return { version: null, error: await tr("The brief could not be saved.") };
  revalidatePath(`/projects/${projectId}/brief`);
  return { version: data[0], error: null };
}
