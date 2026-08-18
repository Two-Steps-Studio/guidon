"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";
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
 * policy runs against the returned row). That RLS behavior is identical
 * whether the INSERT arrives via PostgREST or a direct pg connection — it's
 * enforced by Postgres itself, not by the client — so the self-hosted branch
 * below relies on the exact same trigger and policy, just issues the SQL
 * directly under withUser() instead of through supabase.from().
 */
export async function createOrganization(
  _prevState: CreateOrganizationState,
  formData: FormData
): Promise<CreateOrganizationState> {
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
  const trimmedDescription =
    typeof description === "string" && description.trim() ? description.trim() : null;

  let orgId: string;

  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) return { error: "Not authenticated." };

    try {
      orgId = await withUser(userId, async ({ query }) => {
        const result = await query(
          `INSERT INTO organizations (name, slug, description, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [name.trim(), slug, trimmedDescription, userId]
        );
        return result.rows[0].id as string;
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to create organization." };
    }
  } else {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Not authenticated." };
    }

    const { data: org, error } = await supabase
      .from("organizations")
      .insert({
        name: name.trim(),
        slug,
        description: trimmedDescription,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      return { error: error.message };
    }

    orgId = org.id;
  }

  revalidatePath("/organizations");
  redirect(`/organizations/${orgId}`);
}
