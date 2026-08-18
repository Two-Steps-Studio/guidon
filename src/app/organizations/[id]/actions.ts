"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getOrgAccess } from "@/lib/data/org-access";
import { uniqueSlug } from "@/lib/slug";

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

  const supabase = await createClient();

  // projects.slug is NOT NULL and unique per organization. Migration 004
  // also derives it in a BEFORE INSERT trigger; computing it here keeps
  // creation working if that migration has not been applied yet.
  const { data: siblingSlugs } = await supabase
    .from("projects")
    .select("slug")
    .eq("organization_id", orgId);

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
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      created_by: access.userId,
    })
    .select("id")
    .single();

  // The owner membership is created by private.handle_new_project(); do not
  // insert it again here (see migration 005/README for the duplicate-key bug
  // that caused). Requires migration 009 for the RETURNING select above.
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/organizations/${orgId}`);
  redirect(`/projects/${project.id}`);
}
