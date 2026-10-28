"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { uploadFile, ensureBucketExists } from "@/lib/storage/storage";
import { assertSafeStoragePath } from "@/lib/storage/provider";
import { SAFE_INLINE_IMAGE_TYPES } from "@/lib/storage/storage-constants";
import { tr } from "@/lib/i18n/server-errors";
import { dataClient } from "@/lib/data-client";

export type ProfileFormState = {
  error: string | null;
};

/**
 * Updates the signed-in user's own profile - full_name and avatar_url only.
 * Never touches email (that's identity, not a preference - auth.users is
 * the source of truth for it, changing it is a bigger, separate feature).
 *
 * Relies on profiles_update_own (001_initial_schema.sql): `id = auth.uid()`.
 * No extra permission check needed here - a user can only ever update the
 * row getCurrentUser() itself resolved to their own session.
 */
export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getCurrentUser();

  const fullName = formData.get("full_name");
  const avatarFile = formData.get("avatar") as File | null;

  if (typeof fullName !== "string" || fullName.trim().length === 0) {
    return { error: await tr("Name is required.") };
  }

  const trimmedName = fullName.trim();
  let trimmedAvatar = user.avatar_url;

  // Handle avatar upload if a file was provided
  if (avatarFile && avatarFile.size > 0) {
    try {
      // Ensure avatars bucket exists
      const bucketResult = await ensureBucketExists("avatars", { public: true });
      if (bucketResult.error) {
        return { error: `Storage bucket could not be created: ${bucketResult.error}` };
      }

      // Validate file type - a real allowlist, not just "starts with
      // image/", which would also admit image/svg+xml. This upload is
      // always public and served inline (never a forced download, unlike
      // project files - see SAFE_INLINE_IMAGE_TYPES's own comment), so an
      // SVG's embedded <script> would execute when the URL is opened.
      if (!(SAFE_INLINE_IMAGE_TYPES as readonly string[]).includes(avatarFile.type)) {
        return { error: await tr("Avatar must be a JPEG, PNG, GIF, or WebP image.") };
      }

      // Validate file size (max 2MB)
      if (avatarFile.size > 2 * 1024 * 1024) {
        return { error: await tr("Avatar file is too large. Maximum size: 2MB") };
      }

      // Generate safe file path
      const timestamp = Date.now();
      const extension = avatarFile.name.split('.').pop() || 'jpg';
      const filePath = assertSafeStoragePath(`${user.id}/${timestamp}.${extension}`);

      // Upload file
      const uploadResult = await uploadFile("avatars", filePath, avatarFile, { upsert: true, public: true });
      trimmedAvatar = uploadResult.publicUrl;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Failed to upload avatar." };
    }
  }

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

/**
 * The person's own "show AI features" switch (profiles.hide_ai, 099). Only
 * hides AI in their own view; connected agents and other members are not
 * affected. The update is scoped to their row and checked, so a missing
 * column (099 not applied) or a blocked write is reported, not swallowed.
 */
export async function setHideAi(hide: boolean): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  const { data, error } = await dataClient(user.id)
    .from<{ id: string }>("profiles")
    .update({ hide_ai: hide === true })
    .eq("id", user.id)
    .select("id");
  if (error || !data?.length) return { error: await tr("Could not save the setting.") };
  revalidatePath("/", "layout");
  return { error: null };
}

