import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

/**
 * The Supabase Auth user of this request (hosted mode), or null. getUser()
 * revalidates the token with Supabase Auth - a network round trip - and one
 * page render used to make it five or six times over: the locale lookup
 * (i18n/request.ts), getCurrentUser, and the org/project access helpers
 * each asked on their own. React's cache() makes it once per request.
 *
 * Self-hosted mode doesn't come here: it reads the signed session cookie
 * (getLocalSessionUserId), which is a local HMAC check.
 */
export const getAuthUser = cache(async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
