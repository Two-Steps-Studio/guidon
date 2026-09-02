import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";

/**
 * Guidon Cloud (hosted - no self-managed Postgres) caps an organization's
 * project count. Self-hosted installs (DATABASE_URL set) have no such limit
 * - it's your own infrastructure, not a shared resource Guidon is paying for.
 *
 * The cap itself lives per-organization on organizations.project_limit
 * (migration 014), defaulting to HOSTED_PROJECT_LIMIT_PER_ORG for every new
 * organization. An instance admin can raise it for a specific organization
 * from /admin/organizations - see src/app/admin/organizations/actions.ts.
 * Kept in one place so the UI's "hide the button" check and the Server
 * Action's actual enforcement can never drift apart from each other.
 */
export const HOSTED_PROJECT_LIMIT_PER_ORG = 1;

/**
 * Safety cap (not real pagination) for any query that lists every project a
 * user can see across all their organizations - self-hosted has no plan
 * concept, so nothing else bounds how many rows that can return. Shared by
 * /projects and the dashboard so both pages use the same ceiling instead of
 * two independently-chosen literals.
 */
export const PROJECT_LIST_SAFETY_CAP = 1000;

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

export interface OrgPlanLimits {
  planName: string;
  projectLimit: number | null;
  taskLimitPerProject: number | null;
  storageLimitBytes: number | null;
}

/**
 * Reads the organization's current plan limits via its subscription. Self-
 * hosted installs never call this - every enforcement point checks
 * hasDirectDatabase() first, same convention as isHostedProjectLimitReached.
 */
export async function getOrgPlanLimits(organizationId: string): Promise<OrgPlanLimits> {
  const { createServiceClient } = await import("@/lib/supabase-server");
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plans (name, project_limit, task_limit_per_project, storage_limit_bytes)")
    .eq("organization_id", organizationId)
    .single();

  if (error || !data?.plans) {
    // No subscription row (shouldn't happen post-014/015, but fail closed
    // to Free's limits rather than crashing or silently going unlimited).
    return { planName: "Free", projectLimit: 2, taskLimitPerProject: 50, storageLimitBytes: 500 * 1024 * 1024 };
  }

  const plan = data.plans as unknown as {
    name: string;
    project_limit: number | null;
    task_limit_per_project: number | null;
    storage_limit_bytes: number | null;
  };

  return {
    planName: plan.name,
    projectLimit: plan.project_limit,
    taskLimitPerProject: plan.task_limit_per_project,
    storageLimitBytes: plan.storage_limit_bytes,
  };
}

/** `limit === null` means unlimited, same convention as the plans table itself. */
export function isTaskLimitReached(currentTaskCount: number, limit: number | null): boolean {
  if (limit === null) return false;
  return currentTaskCount >= limit;
}

/** Same convention: `limit === null` means unlimited. */
export function isStorageLimitReached(currentUsageBytes: number, limit: number | null): boolean {
  if (limit === null) return false;
  return currentUsageBytes >= limit;
}
