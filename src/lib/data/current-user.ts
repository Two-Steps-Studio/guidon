import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { getLocalSessionUserId } from "@/lib/auth/local-auth";

export type CurrentUser = {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
};

/**
 * The signed-in user plus the profile fields every top-level page's
 * <Navigation> needs. Cached per request: several pages fetch this and
 * their own data in the same render, and this is the one that isn't worth
 * a second round trip.
 *
 * proxy.ts already blocks unauthenticated requests from reaching these
 * routes at all, so `redirect` here is a defensive fallback, not the primary
 * gate.
 *
 * Branches on hasDirectDatabase() the same way the migration runner decides
 * whether to apply the auth-compat bootstrap: DATABASE_URL set means this
 * process is a self-hosted install with no Supabase software to ask, so
 * identity comes from the signed session cookie (src/lib/auth/local-auth.ts)
 * and the profile is read straight from Postgres under withUser() instead of
 * through the Supabase client. Every other call site that still calls
 * createClient() is unaffected by this branch — this function only changes
 * how identity itself is resolved.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser> {
  if (hasDirectDatabase()) {
    const userId = await getLocalSessionUserId();
    if (!userId) redirect("/auth/login");

    const profile = await withUser(userId, ({ query }) =>
      query("SELECT email, full_name, avatar_url FROM profiles WHERE id = $1", [userId])
    );

    const row = profile.rows[0] as
      | { email: string | null; full_name: string | null; avatar_url: string | null }
      | undefined;

    return {
      id: userId,
      email: row?.email ?? undefined,
      full_name: row?.full_name ?? undefined,
      avatar_url: row?.avatar_url ?? undefined,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? undefined,
    full_name: profile?.full_name ?? undefined,
    avatar_url: profile?.avatar_url ?? undefined,
  };
});
