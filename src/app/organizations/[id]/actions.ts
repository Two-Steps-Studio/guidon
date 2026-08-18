"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getOrgAccess } from "@/lib/data/org-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { uniqueSlug } from "@/lib/slug";
import { isHostedProjectLimitReached, HOSTED_PROJECT_LIMIT_MESSAGE } from "@/lib/limits";

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

    // Guidon Cloud's 1-project-per-organization cap (src/lib/limits.ts) —
    // self-hosted installs never hit this, see isHostedProjectLimitReached().
    // Checked here, not just hidden in the UI (organizations/[id]/page.tsx),
    // because this Server Action is reachable directly regardless of what
    // the page renders.
    if (isHostedProjectLimitReached(siblingSlugs?.length ?? 0)) {
      return { error: HOSTED_PROJECT_LIMIT_MESSAGE };
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

  revalidatePath(`/organizations/${orgId}`);
  redirect(`/projects/${projectId}`);
}
