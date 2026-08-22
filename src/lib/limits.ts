import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";

/**
 * Guidon Cloud (hosted — no self-managed Postgres) caps an organization's
 * project count. Self-hosted installs (DATABASE_URL set) have no such limit
 * — it's your own infrastructure, not a shared resource Guidon is paying for.
 *
 * The cap itself lives per-organization on organizations.project_limit
 * (migration 014), defaulting to HOSTED_PROJECT_LIMIT_PER_ORG for every new
 * organization. An instance admin can raise it for a specific organization
 * from /admin/organizations — see src/app/admin/organizations/actions.ts.
 * Kept in one place so the UI's "hide the button" check and the Server
 * Action's actual enforcement can never drift apart from each other.
 */
export const HOSTED_PROJECT_LIMIT_PER_ORG = 1;

export function isHostedProjectLimitReached(
  currentProjectCount: number,
  limit: number = HOSTED_PROJECT_LIMIT_PER_ORG
): boolean {
  if (hasDirectDatabase()) return false;
  return currentProjectCount >= limit;
}

export function hostedProjectLimitMessage(limit: number): string {
  const projectWord = limit === 1 ? "project" : "projects";
  return `Guidon Cloud is limited to ${limit} ${projectWord} per organization. Create another organization, or self-host Guidon for unlimited projects.`;
}
