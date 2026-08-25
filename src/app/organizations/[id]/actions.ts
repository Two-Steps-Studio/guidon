"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageOrg, getOrgAccess } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import { uniqueSlug } from "@/lib/slug";
import { isHostedProjectLimitReached, hostedProjectLimitMessage } from "@/lib/limits";
import { ensureBucketExists, uploadFile } from "@/lib/storage/storage";
import { assertSafeStoragePath } from "@/lib/storage/provider";

export type CreateProjectState = {
  error: string | null;
};

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

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Project name is required." };
  }

  const trimmedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;

  let projectId: string;

  // The owner membership is created by private.handle_new_project(); do not
  // insert it again here (see migration 005/README for the duplicate-key bug
  // that caused). Requires migration 009 for the RETURNING select below.
  if (hasDirectDatabase()) {
    try {
      projectId = await withUser(access.userId, async ({ query }) => {
        // projects.slug is NOT NULL and unique per organization. Migration 004
        // also derives it in a BEFORE INSERT trigger; computing it here keeps
        // creation working if that migration has not been applied yet.
        const siblings = await query("SELECT slug FROM projects WHERE organization_id = $1", [
          orgId,
        ]);
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
          [orgId, name.trim(), slug, trimmedDescription, access.userId]
        );
        return result.rows[0].id as string;
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to create project." };
    }
  } else {
    const supabase = await createClient();

    const { data: siblingSlugs } = await supabase
      .from("projects")
      .select("slug")
      .eq("organization_id", orgId);

    // Guidon Cloud's 1-project-per-organization cap (src/lib/limits.ts) -
    // self-hosted installs never hit this, see isHostedProjectLimitReached().
    // Checked here, not just hidden in the UI (organizations/[id]/page.tsx),
    // because this Server Action is reachable directly regardless of what
    // the page renders.
    if (isHostedProjectLimitReached(siblingSlugs?.length ?? 0, access.organization.project_limit)) {
      return { error: hostedProjectLimitMessage(access.organization.project_limit) };
    }

    const slug = uniqueSlug(
      name,
      (siblingSlugs ?? [])
        .map((row: { slug: string | null }) => row.slug)
        .filter((value): value is string => Boolean(value))
    );

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        organization_id: orgId,
        name: name.trim(),
        slug,
        description: trimmedDescription,
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
