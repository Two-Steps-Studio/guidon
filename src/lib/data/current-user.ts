import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

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
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser> {
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
