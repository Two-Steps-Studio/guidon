export const ADMIN_PAGE_PERMISSIONS = {
  "/admin": "overview.read",
  "/admin/organizations": "organizations.read",
  "/admin/users": "users.read",
  "/admin/integrations": "integrations.read",
  "/admin/logs": "activity.read",
  "/admin/audit": "audit.read",
  "/admin/feedback": "feedback.read",
  "/admin/funnel": "funnel.read",
  "/admin/search": "search.read",
  "/admin/promo-codes": "promos.read",
  "/admin/billing": "billing.read",
  "/admin/modules": "modules.read",
} as const;

export type AdminPage = keyof typeof ADMIN_PAGE_PERMISSIONS;
export type AdminPermission = (typeof ADMIN_PAGE_PERMISSIONS)[AdminPage]
  | "organizations.limits.edit" | "organizations.plan.edit"
  | "billing.prices.sync" | "promos.create" | "promos.toggle"
  | "modules.review" | "modules.withdraw" | "modules.reports.resolve"
  | "users.pii.reveal" | "users.directory.search";

const ROLE_PERMISSIONS = {
  super_admin: [
    ...Object.values(ADMIN_PAGE_PERMISSIONS),
    "users.pii.reveal",
    "users.directory.search",
    "organizations.limits.edit", "organizations.plan.edit", "billing.prices.sync",
    "promos.create", "promos.toggle", "modules.review", "modules.withdraw", "modules.reports.resolve",
  ],
  support: ["overview.read", "users.read", "organizations.read", "feedback.read"],
  finance: [
    "overview.read", "organizations.read", "funnel.read", "promos.read", "billing.read",
    "organizations.plan.edit", "billing.prices.sync", "promos.create", "promos.toggle",
  ],
  engineering: [
    "overview.read", "integrations.read", "activity.read", "search.read", "modules.read",
    "modules.review", "modules.withdraw", "modules.reports.resolve",
  ],
  read_only: ["overview.read", "funnel.read"],
} as const satisfies Record<string, readonly AdminPermission[]>;

export type AdminRole = keyof typeof ROLE_PERMISSIONS;

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && Object.hasOwn(ROLE_PERMISSIONS, value);
}

export function hasAdminPermission(role: unknown, permission: AdminPermission): boolean {
  if (!isAdminRole(role)) return false;
  const permissions: readonly AdminPermission[] = ROLE_PERMISSIONS[role];
  return permissions.includes(permission);
}

export function adminPagesForRole(role: AdminRole): AdminPage[] {
  return (Object.keys(ADMIN_PAGE_PERMISSIONS) as AdminPage[])
    .filter(page => hasAdminPermission(role, ADMIN_PAGE_PERMISSIONS[page]));
}

/** Invalid modes and missing grants must never fall through to legacy access. */
export function resolveAdminRole(mode: string | undefined, allowlisted: boolean, grantRole?: unknown): AdminRole | null {
  if (!allowlisted) return null;
  if (mode === undefined || mode === "" || mode === "legacy") return "super_admin";
  if ((mode === "grants" || mode === "sso") && isAdminRole(grantRole)) return grantRole;
  return null;
}
