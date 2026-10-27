"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { retryAutomationRun } from "@/lib/data/module-automations";

export async function retryModuleAutomation(projectId: string, moduleId: string, runId: string): Promise<boolean> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role) || !/^[0-9a-f-]{36}$/.test(runId)) return false;
  const ok = await retryAutomationRun(projectId, runId);
  revalidatePath(`/projects/${projectId}/modules/${moduleId}`);
  return ok;
}
