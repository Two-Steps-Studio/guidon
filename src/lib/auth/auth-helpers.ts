import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { User } from "@supabase/supabase-js";

/**
 * Auth check for the narrow /api/v1 surface (currently only `search`).
 *
 * This module used to also gate 13 CRUD routes under /api/v1 with
 * requireOrganizationAccess() / requireProjectAccess() / requireProjectPermission().
 * Those routes were dead (the UI never called them — everything else moved to
 * Server Components/Actions, see docs/self-hosting-audit.md blocker 1) and were
 * removed together with the org/project/permission helpers that only they used.
 * Real page-level authorization now lives in src/lib/data/project-access.ts and
 * src/lib/data/org-access.ts, which are unrelated to this file.
 *
 * Keep this file minimal: it exists only so /api/v1 routes (present and future,
 * e.g. GitHub webhooks, agent integrations) have a single place to check
 * "is there a logged-in user" without duplicating the Supabase call.
 */

export interface AuthContext {
  user: User;
  profile?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

const UNAUTHORIZED = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const SERVICE_DISABLED = NextResponse.json({ error: "Service disabled" }, { status: 503 });

/**
 * Checks if user is authenticated and returns AuthContext
 * @returns AuthContext or NextResponse with 401/503 error
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return SERVICE_DISABLED;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return UNAUTHORIZED;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile: profile || undefined,
  };
}

/**
 * Checks if auth result is an error response
 */
export function isAuthError(auth: AuthContext | NextResponse): auth is NextResponse {
  return auth instanceof NextResponse;
}
