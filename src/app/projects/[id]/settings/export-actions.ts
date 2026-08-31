"use server";

import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { logActivity } from "@/lib/data/log-activity";
import { exportProjectToFile } from "@/lib/guidon-export/export-project";

export interface ExportProjectResult {
  filename: string | null;
  contents: string | null;
  error: string | null;
}

/** Returns the full `.guidon` file as a JSON string for the client to download as a Blob. */
export async function exportProject(projectId: string): Promise<ExportProjectResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { filename: null, contents: null, error: "You do not have permission to export this project." };
  }

  const { filename, json } = await exportProjectToFile(projectId, access.userId, {
    name: access.project.name,
    description: access.project.description,
    projectType: access.project.project_type,
  });

  await logActivity({
    userId: access.userId,
    action: "project_exported",
    projectId,
    entityType: "project",
    entityId: projectId,
  });

  return { filename, contents: JSON.stringify(json, null, 2), error: null };
}
