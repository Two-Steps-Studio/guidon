"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { getOrgAccess } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import { getUniqueProjectSlug } from "@/lib/data/project-slug";
import { getOrgPlanLimits, isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
import {
  runGuidonImport,
  summarizeGuidonImport,
  validateGuidonFile,
  type GuidonImportPreview,
  type ValidatedGuidonImport,
} from "@/lib/guidon-export/import-project";
import type { TaskBoardData } from "@/lib/guidon-export/sections/task-board";

export type { GuidonImportPreview };

export type PreviewGuidonImportResult =
  | { preview: GuidonImportPreview; error: null }
  | { preview: null; error: string };

/** Parse + validate only - no writes. Used to render the confirm dialog. */
export async function previewGuidonImport(fileContent: string): Promise<PreviewGuidonImportResult> {
  const validated = validateGuidonFile(fileContent);
  if (!validated.ok) return { preview: null, error: validated.error };
  return { preview: summarizeGuidonImport(validated.result), error: null };
}

export type ImportGuidonMode = "new" | "overwrite";

export interface ImportGuidonFileInput {
  fileContent: string;
  mode: ImportGuidonMode;
  /** Organization id when mode is "new", target project id when mode is "overwrite". */
  targetId: string;
}

export interface ImportGuidonFileResult {
  error: string | null;
}

async function createProjectForImport(
  orgId: string,
  userId: string,
  name: string,
  description: string | null,
  projectType: string | null
): Promise<{ projectId: string | null; error: string | null }> {
  if (hasDirectDatabase()) {
    try {
      const { slug } = await getUniqueProjectSlug(orgId, userId, name);
      const projectId = await withUser(userId, async ({ query }) => {
        const result = await query(
          `INSERT INTO projects (organization_id, name, slug, description, project_type, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [orgId, name, slug, description, projectType, userId]
        );
        return result.rows[0].id as string;
      });
      return { projectId, error: null };
    } catch (error) {
      return { projectId: null, error: error instanceof Error ? error.message : "Failed to create project." };
    }
  }

  const supabase = await createClient();
  const orgAccess = await getOrgAccess(orgId);
  if (!orgAccess) return { projectId: null, error: "You do not have access to this organization." };

  const { slug, siblingCount } = await getUniqueProjectSlug(orgId, userId, name);

  if (isHostedProjectLimitReached(siblingCount, orgAccess.organization.project_limit)) {
    return { projectId: null, error: hostedProjectLimitMessage(orgAccess.organization.project_limit) };
  }

  const { data: created, error } = await supabase
    .from("projects")
    .insert({ organization_id: orgId, name, slug, description, project_type: projectType, created_by: userId })
    .select("id")
    .single();

  if (error) return { projectId: null, error: error.message };
  return { projectId: created.id as string, error: null };
}

async function deleteOrphanedProject(projectId: string, userId: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withUser(userId, ({ query }) => query("DELETE FROM projects WHERE id = $1", [projectId]));
    return;
  }
  const supabase = await createClient();
  await supabase.from("projects").delete().eq("id", projectId);
}

function importedTaskCount(result: ValidatedGuidonImport): number {
  const taskBoard = result.validatedSections.get("taskBoard") as TaskBoardData | undefined;
  return taskBoard?.tasks.length ?? 0;
}

/**
 * A .guidon import fully replaces the target project's task set - see
 * taskBoardSection.importData, which deletes every existing task and
 * inserts the file's tasks in its place - so the count that matters is the
 * file's own task count, not "existing count + N more" the way
 * createTask/createSubtask's checkTaskLimit (work/actions.ts) checks it.
 * Without this, importing a .guidon file was the one write path into
 * `tasks` that never checked Guidon Cloud's per-project task cap at all.
 */
async function checkImportTaskLimit(
  organizationId: string,
  taskCount: number
): Promise<{ error: string | null }> {
  if (hasDirectDatabase()) return { error: null };

  const { planName, taskLimitPerProject } = await getOrgPlanLimits(organizationId);
  if (taskLimitPerProject !== null && taskCount > taskLimitPerProject) {
    return {
      error: `This file has ${taskCount} tasks, which is over your ${planName} plan's limit of ${taskLimitPerProject} tasks per project. Upgrade your plan, or trim the file before importing.`,
    };
  }
  return { error: null };
}

export async function importGuidonFile(input: ImportGuidonFileInput): Promise<ImportGuidonFileResult> {
  const validated = validateGuidonFile(input.fileContent);
  if (!validated.ok) return { error: validated.error };

  const taskCount = importedTaskCount(validated.result);

  let projectId: string;
  let userId: string;

  if (input.mode === "new") {
    const orgAccess = await getOrgAccess(input.targetId);
    if (!orgAccess) return { error: "You do not have access to this organization." };
    userId = orgAccess.userId;

    // Checked before creating the project so a file that's over the cap
    // never leaves behind a permanently-empty orphaned project.
    const limitCheck = await checkImportTaskLimit(input.targetId, taskCount);
    if (limitCheck.error) return { error: limitCheck.error };

    const created = await createProjectForImport(
      input.targetId,
      userId,
      validated.result.projectName,
      validated.result.projectDescription,
      validated.result.projectType
    );
    if (created.error || !created.projectId) {
      return { error: created.error ?? "Failed to create project." };
    }
    projectId = created.projectId;
  } else {
    const projectAccess = await getProjectAccess(input.targetId);
    if (!projectAccess || !canManageProject(projectAccess.role)) {
      return { error: "You do not have permission to overwrite this project." };
    }
    userId = projectAccess.userId;
    projectId = input.targetId;

    const limitCheck = await checkImportTaskLimit(projectAccess.project.organization_id, taskCount);
    if (limitCheck.error) return { error: limitCheck.error };
  }

  try {
    await runGuidonImport(projectId, userId, validated.result);
  } catch (error) {
    // "new" mode already created the project before the import data itself
    // failed to write - clean that up rather than leaving an orphaned,
    // permanently empty project behind (which also counts against the
    // org's project limit on hosted Cloud). Best-effort: if the cleanup
    // delete itself fails, the user still gets the real import error, not
    // a delete error masking it.
    if (input.mode === "new") {
      await deleteOrphanedProject(projectId, userId).catch(() => {});
    }
    return { error: error instanceof Error ? error.message : "Failed to import the project data." };
  }

  await logActivity({
    userId,
    action: "project_imported",
    projectId,
    entityType: "project",
    entityId: projectId,
    details: { mode: input.mode, name: validated.result.projectName },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
