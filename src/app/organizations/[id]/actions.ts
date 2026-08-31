"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import { getUniqueProjectSlug } from "@/lib/data/project-slug";
import { isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
import { ensureBucketExists, uploadFile } from "@/lib/storage/storage";
import { assertSafeStoragePath } from "@/lib/storage/provider";
import type { ProjectType } from "@/types/project";

export type CreateProjectState = {
  error: string | null;
};

const VALID_PROJECT_TYPES: ProjectType[] = ["game", "website", "mobile_app", "api", "tool", "other"];

export async function createProject(
  orgId: string,
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const access = await getOrgAccess(orgId);

  if (!access) {
    return { error: "You do not have access to this organization." };
  }

  const name = formData.get("name");
  const description = formData.get("description");
  const projectTypeRaw = formData.get("projectType");

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Project name is required." };
  }

  let projectType: ProjectType | null = null;
  if (typeof projectTypeRaw === "string" && projectTypeRaw.trim()) {
    if (!VALID_PROJECT_TYPES.includes(projectTypeRaw as ProjectType)) {
      return { error: "Invalid project type." };
    }
    projectType = projectTypeRaw as ProjectType;
  }

  const trimmedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;

  let projectId: string;

  // The owner membership is created by private.handle_new_project(); do not
  // insert it again here (see migration 005/README for the duplicate-key bug
  // that caused). Requires migration 009 for the RETURNING select below.
  // projects.slug is NOT NULL and unique per organization. Migration 004
  // also derives it in a BEFORE INSERT trigger; computing it here keeps
  // creation working if that migration has not been applied yet.
  const { slug, siblingCount } = await getUniqueProjectSlug(orgId, access.userId, name);

  if (hasDirectDatabase()) {
    try {
      projectId = await withUser(access.userId, async ({ query }) => {
        const result = await query(
          `INSERT INTO projects (organization_id, name, slug, description, project_type, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [orgId, name.trim(), slug, trimmedDescription, projectType, access.userId]
        );
        return result.rows[0].id as string;
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to create project." };
    }
  } else {
    const supabase = await createClient();

    // Guidon Cloud's 1-project-per-organization cap (src/lib/limits.ts) -
    // self-hosted installs never hit this, see isHostedProjectLimitReached().
    // Checked here, not just hidden in the UI (organizations/[id]/page.tsx),
    // because this Server Action is reachable directly regardless of what
    // the page renders.
    if (isHostedProjectLimitReached(siblingCount, access.organization.project_limit)) {
      return { error: hostedProjectLimitMessage(access.organization.project_limit) };
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        organization_id: orgId,
        name: name.trim(),
        slug,
        description: trimmedDescription,
        project_type: projectType,
        created_by: access.userId,
      })
      .select("id")
      .single();

    if (error) {
      return { error: error.message };
    }

    projectId = project.id;
  }

  await logActivity({
    userId: access.userId,
    action: "project_created",
    projectId,
    entityType: "project",
    entityId: projectId,
    details: { name: name.trim() },
  });

  revalidatePath(`/organizations/${orgId}`);
  redirect(`/projects/${projectId}`);
}

export type OrgAvatarState = {
  error: string | null;
};

export async function updateOrganizationAvatar(
  orgId: string,
  _prevState: OrgAvatarState,
  formData: FormData
): Promise<OrgAvatarState> {
  const access = await getOrgAccess(orgId);

  if (!access || !canManageOrg(access.role)) {
    return { error: "You do not have permission to edit this organization." };
  }

  const avatarFile = formData.get("avatar") as File | null;
  if (!avatarFile || avatarFile.size === 0) {
    return { error: "No image selected." };
  }
  if (!avatarFile.type.startsWith("image/")) {
    return { error: "Organization image must be an image file." };
  }
  if (avatarFile.size > 2 * 1024 * 1024) {
    return { error: "Organization image is too large. Maximum size: 2MB" };
  }

  const bucketResult = await ensureBucketExists("avatars", { public: true });
  if (bucketResult.error) {
    return { error: `Storage bucket could not be created: ${bucketResult.error}` };
  }

  const timestamp = Date.now();
  const extension = avatarFile.name.split(".").pop() || "jpg";
  const filePath = assertSafeStoragePath(`organizations/${orgId}/${timestamp}.${extension}`);

  let avatarUrl: string;
  try {
    const uploadResult = await uploadFile("avatars", filePath, avatarFile, {
      upsert: true,
      public: true,
    });
    avatarUrl = uploadResult.publicUrl;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to upload organization image." };
  }

  if (hasDirectDatabase()) {
    try {
      await withUser(access.userId, ({ query }) =>
        query("UPDATE organizations SET avatar_url = $1 WHERE id = $2", [avatarUrl, orgId])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update organization." };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ avatar_url: avatarUrl })
      .eq("id", orgId);

    if (error) return { error: error.message };
  }

  revalidatePath(`/organizations/${orgId}`);
  revalidatePath("/organizations");
  return { error: null };
}
