"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { getOrgAccess } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import { uniqueSlug } from "@/lib/slug";
import { isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
import {
  runGuidonImport,
  summarizeGuidonImport,
  validateGuidonFile,
  type GuidonImportPreview,
} from "@/lib/guidon-export/import-project";

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
  description: string | null
): Promise<{ projectId: string | null; error: string | null }> {
  if (hasDirectDatabase()) {
    try {
      const projectId = await withUser(userId, async ({ query }) => {
        const siblings = await query("SELECT slug FROM projects WHERE organization_id = $1", [orgId]);
        const slug = uniqueSlug(
          name,
          siblings.rows
            .map((row: { slug: string | null }) => row.slug)
            .filter((value: string | null): value is string => Boolean(value))
        );

        const result = await query(
          `INSERT INTO projects (organization_id, name, slug, description, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [orgId, name, slug, description, userId]
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

  const { data: siblingSlugs } = await supabase.from("projects").select("slug").eq("organization_id", orgId);

  if (isHostedProjectLimitReached(siblingSlugs?.length ?? 0, orgAccess.organization.project_limit)) {
    return { projectId: null, error: hostedProjectLimitMessage(orgAccess.organization.project_limit) };
  }

  const slug = uniqueSlug(
    name,
    (siblingSlugs ?? [])
      .map((row: { slug: string | null }) => row.slug)
      .filter((value): value is string => Boolean(value))
  );

  const { data: created, error } = await supabase
    .from("projects")
    .insert({ organization_id: orgId, name, slug, description, created_by: userId })
    .select("id")
    .single();

  if (error) return { projectId: null, error: error.message };
  return { projectId: created.id as string, error: null };
}

export async function importGuidonFile(input: ImportGuidonFileInput): Promise<ImportGuidonFileResult> {
  const validated = validateGuidonFile(input.fileContent);
  if (!validated.ok) return { error: validated.error };

  let projectId: string;
  let userId: string;

  if (input.mode === "new") {
    const orgAccess = await getOrgAccess(input.targetId);
    if (!orgAccess) return { error: "You do not have access to this organization." };

    userId = orgAccess.userId;
    const created = await createProjectForImport(
      input.targetId,
      userId,
      validated.result.projectName,
      validated.result.projectDescription
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
  }

  try {
    await runGuidonImport(projectId, userId, validated.result);
  } catch (error) {
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
