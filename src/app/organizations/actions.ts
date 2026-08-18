"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/slug";

export type CreateOrganizationState = {
  error: string | null;
};

/**
 * Creates an organization. The owner membership and `created_by` are set by
 * private.handle_new_organization() and set_organization_creator() — do not
 * insert the membership again here, see migration 005/README for the
 * duplicate-key bug that caused.
 *
 * Relies on migration 009 (INSERT ... RETURNING previously failed RLS
 * because the owner membership does not exist yet at the instant the SELECT
 * policy runs against the returned row).
 */
export async function createOrganization(
  _prevState: CreateOrganizationState,
  formData: FormData
): Promise<CreateOrganizationState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const name = formData.get("name");
  const slugInput = formData.get("slug");
  const description = formData.get("description");

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Organization name is required." };
  }

  const slug =
    typeof slugInput === "string" && slugInput.trim()
      ? slugify(slugInput)
      : slugify(name);

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      name: name.trim(),
      slug,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/organizations");
  redirect(`/organizations/${org.id}`);
}
