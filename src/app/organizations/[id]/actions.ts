"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { getUniqueProjectSlug } from "@/lib/data/project-slug";
import { isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
import { ensureBucketExists, uploadFile } from "@/lib/storage/storage";
import { assertSafeStoragePath } from "@/lib/storage/provider";
import { SAFE_INLINE_IMAGE_TYPES } from "@/lib/storage/storage-constants";
import type { ProjectMethodology, ProjectType } from "@/types/project";

export type CreateProjectState = {
  error: string | null;
};

const VALID_PROJECT_TYPES: ProjectType[] = ["game", "website", "mobile_app", "api", "tool", "other"];
const VALID_METHODOLOGIES: ProjectMethodology[] = ["standard", "scrum"];

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

  const methodologyRaw = formData.get("methodology");
  let methodology: ProjectMethodology = "standard";
  if (typeof methodologyRaw === "string" && methodologyRaw.trim()) {
    if (!VALID_METHODOLOGIES.includes(methodologyRaw as ProjectMethodology)) {
      return { error: "Invalid workflow." };
    }
    methodology = methodologyRaw as ProjectMethodology;
  }

  const trimmedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;

  // A plain checkbox: present ("on") when ticked, absent from FormData
  // entirely when not - so anything but "on" means AI was switched off.
  const aiEnabled = formData.get("aiEnabled") === "on";

  // The owner membership is created by private.handle_new_project(); do not
  // insert it again here (see migration 005/README for the duplicate-key bug
  // that caused). Requires migration 009 for the RETURNING select below.
  // projects.slug is NOT NULL and unique per organization. Migration 004
  // also derives it in a BEFORE INSERT trigger; computing it here keeps
  // creation working if that migration has not been applied yet.
  const { slug, siblingCount } = await getUniqueProjectSlug(orgId, access.userId, name);

  // Guidon Cloud's per-organization project cap (src/lib/limits.ts) -
  // self-hosted never hits it, see isHostedProjectLimitReached(). Checked
  // here, not just hidden in the UI (organizations/[id]/page.tsx), because
  // this Server Action is reachable directly regardless of what the page
  // renders.
  if (isHostedProjectLimitReached(siblingCount, access.organization.project_limit)) {
    return { error: hostedProjectLimitMessage(access.organization.project_limit) };
  }

  const { data: project, error } = await dataClient(access.userId)
    .from<{ id: string }>("projects")
    .insert({
      organization_id: orgId,
      name: name.trim(),
      slug,
      description: trimmedDescription,
      project_type: projectType,
      methodology,
      ai_enabled: aiEnabled,
      created_by: access.userId,
    })
    .select("id")
    .single();

  if (error || !project) return { error: error?.message ?? "Failed to create project." };
  const projectId = project.id;

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
  // Real allowlist, not "starts with image/" (would admit image/svg+xml) -
  // this upload is always public and served inline, never a forced
  // download, so an SVG's embedded <script> would execute on open. See
  // SAFE_INLINE_IMAGE_TYPES's own comment.
  if (!(SAFE_INLINE_IMAGE_TYPES as readonly string[]).includes(avatarFile.type)) {
    return { error: "Organization image must be a JPEG, PNG, GIF, or WebP image." };
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

  // Row check: an RLS-blocked update (organizations_update needs owner/admin,
  // same as canManageOrg above) shouldn't report success.
  const { data: updated, error } = await dataClient(access.userId)
    .from("organizations")
    .update({ avatar_url: avatarUrl })
    .eq("id", orgId)
    .select("id");
  if (error) return { error: error.message };
  if (updated.length === 0) return { error: "You do not have permission to edit this organization." };

  revalidatePath(`/organizations/${orgId}`);
  revalidatePath("/organizations");
  return { error: null };
}
