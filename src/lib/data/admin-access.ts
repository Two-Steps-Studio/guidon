import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasAdminPermission, resolveAdminRole, type AdminPermission } from "@/lib/admin/permissions";
import { serviceDataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";
import { getAuthUser } from "./auth-user";
import { getCurrentUser } from "./current-user";
import { hasActiveAdminSession } from "@/lib/admin/session";
import { ADMIN_SIGN_IN_PATH } from "@/lib/admin/session-policy";

/** Preflight for SSO/MFA enrollment checks. Admin data requires requireAdminAccess. */
export const requireAdminIdentity = cache(async () => {
  const user = await getCurrentUser();
  const emails = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean));
  if (emails.size === 0) redirect("/dashboard");

  // Profile fields can be edited. Use the authentication record for allowlist checks.
  const email = hasDirectDatabase()
    ? await withServiceRole(async ({ query }) => {
      const result = await query("SELECT email FROM auth.users WHERE id = $1", [user.id]);
      return result.rows[0]?.email as string | null | undefined;
    })
    : (await getAuthUser())?.email;
  if (!email || !emails.has(email.toLowerCase())) redirect("/dashboard");

  const mode = process.env.PLATFORM_ADMIN_ACCESS;
  let grantRole: unknown;
  let grantId: string | null = null;
  if (mode === "grants" || mode === "sso") {
    const { data, error } = await serviceDataClient()
      .from<{ id: string; role: string }>("platform_admin_grants")
      .select("id, role")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) redirect("/dashboard");
    grantRole = data?.role;
    grantId = data?.id ?? null;
  }

  const role = resolveAdminRole(mode, true, grantRole);
  if (!role) redirect("/dashboard");
  return { ...user, email, role, grantId };
});

const getAdminAccess = cache(async () => {
  const admin = await requireAdminIdentity();
  if (process.env.PLATFORM_ADMIN_ACCESS === "sso" &&
      (!admin.grantId || !await hasActiveAdminSession(admin.id, admin.grantId))) {
    redirect(ADMIN_SIGN_IN_PATH);
  }
  return admin;
});

/** Layouts, pages and Server Actions call this independently. */
export async function requireAdminAccess(permission: AdminPermission) {
  const admin = await getAdminAccess();
  if (!hasAdminPermission(admin.role, permission)) redirect("/admin");
  return admin;
}
