import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "./current-user";

/**
 * Instance-admin gate (TODO.md §25).
 *
 * Guidon has no site-wide "admin" role — authorization elsewhere in this
 * codebase is entirely scoped to organization/project membership
 * (src/lib/data/org-access.ts, src/lib/data/project-access.ts). Rather than
 * invent a new role column and an admin-granting UI (a security feature
 * that deserves its own careful design, out of scope here), instance-admin
 * access is a static allowlist read from the environment: ADMIN_EMAILS,
 * comma-separated, matched case-insensitively against the signed-in user's
 * email.
 *
 * An unset or empty ADMIN_EMAILS makes /admin unreachable by anyone — the
 * safe default for an install that hasn't opted in.
 */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * getCurrentUser() already redirects unauthenticated requests to
 * /auth/login, so by the time we get here there is always a signed-in user
 * — this only has to decide whether *this* user is on the allowlist.
 */
export async function requireAdminAccess() {
  const user = await getCurrentUser();
  const allowed = adminEmails();

  if (allowed.size === 0 || !user.email || !allowed.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  return user;
}
