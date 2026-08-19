"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export type ProfileFormState = {
  error: string | null;
};

/**
 * Updates the signed-in user's own profile — full_name and avatar_url only.
 * Never touches email (that's identity, not a preference — auth.users is
 * the source of truth for it, changing it is a bigger, separate feature).
 *
 * Relies on profiles_update_own (001_initial_schema.sql): `id = auth.uid()`.
 * No extra permission check needed here — a user can only ever update the
 * row getCurrentUser() itself resolved to their own session.
 */
export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getCurrentUser();

  const fullName = formData.get("full_name");
  const avatarUrl = formData.get("avatar_url");

  if (typeof fullName !== "string" || fullName.trim().length === 0) {
    return { error: "Name is required." };
  }

  const trimmedName = fullName.trim();
  const trimmedAvatar = typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null;

  if (hasDirectDatabase()) {
    try {
      await withUser(user.id, ({ query }) =>
        query("UPDATE profiles SET full_name = $1, avatar_url = $2 WHERE id = $3", [
          trimmedName,
          trimmedAvatar,
          user.id,
        ])
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to update profile." };
    }

    revalidatePath("/profile");
    return { error: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: trimmedName, avatar_url: trimmedAvatar })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { error: null };
}
