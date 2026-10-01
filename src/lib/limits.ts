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
  memberLimitPerProject: number | null;
  storageLimitBytes: number | null;
  /** plans.member_limit (migration 051): seats - organization_members rows, owner included. */
  memberLimit: number | null;
}

/** Free's seats, also the fail-closed fallback below - keep equal to 051's value for 'free'. */
export const FREE_PLAN_MEMBER_LIMIT = 8;

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
    // "*" rather than a column list: naming member_limit_per_project (049)
    // would make this query fail - and every organization fall back to Free
    // below - on a database where that migration hasn't run yet.
    .select("plans (*)")
    .eq("organization_id", organizationId)
    .single();

  if (error || !data?.plans) {
    // No subscription row (shouldn't happen post-014/015, but fail closed
    // to Free's limits rather than crashing or silently going unlimited).
    return {
      planName: "Free",
      projectLimit: 2,
      taskLimitPerProject: 50,
      memberLimitPerProject: 5,
      storageLimitBytes: 500 * 1024 * 1024,
      memberLimit: FREE_PLAN_MEMBER_LIMIT,
    };
  }

  const plan = data.plans as unknown as {
    name: string;
    project_limit: number | null;
    task_limit_per_project: number | null;
    member_limit_per_project?: number | null;
    /** Absent before migration 051 - "*" just doesn't return it. */
    member_limit?: number | null;
    storage_limit_bytes: number | null;
  };

  return {
    planName: plan.name,
    projectLimit: plan.project_limit,
    taskLimitPerProject: plan.task_limit_per_project,
    memberLimitPerProject: plan.member_limit_per_project ?? null,
    storageLimitBytes: plan.storage_limit_bytes,
    memberLimit: plan.member_limit ?? null,
  };
}

/** Seats in use: every organization_members row, owner included. Service role - the count must not depend on what the caller can see. */
export async function getOrganizationMemberCount(organizationId: string): Promise<number> {
  const { createServiceClient } = await import("@/lib/supabase-server");
  const { count, error } = await createServiceClient()
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) throw new Error(`Could not count organization members: ${error.message}`);
  return count ?? 0;
}

/**
 * Guidon Cloud's tasks-per-project cap, as one readable error (or null when
 * there's room, and always null self-hosted). The single check behind every
 * way a task gets created - the board, subtasks, /api/v1 tasks and in-game
 * reports - so they can't drift apart again: the API used to count only
 * top-level tasks and skip subtasks entirely, which reopened the bypass the
 * board had closed (nesting unlimited subtasks under one task). Counts every
 * row in `tasks` for the project, subtasks included, with the service role
 * so the number doesn't depend on what the caller can see.
 */
export async function hostedTaskLimitError(projectId: string, organizationId: string): Promise<string | null> {
  if (hasDirectDatabase()) return null;
  const { createServiceClient } = await import("@/lib/supabase-server");
  const [{ planName, taskLimitPerProject }, { count }] = await Promise.all([
    getOrgPlanLimits(organizationId),
    createServiceClient().from("tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  if (!isTaskLimitReached(count ?? 0, taskLimitPerProject)) return null;
  return `You've reached your ${planName} plan's limit of ${taskLimitPerProject} tasks per project. Upgrade your plan to raise this limit.`;
}

/**
 * Guidon Cloud seats (plans.member_limit, migration 051) as a readable
 * error, or null when there's room - always null self-hosted.
 */
export async function hostedMemberLimitError(organizationId: string): Promise<string | null> {
  if (hasDirectDatabase()) return null;
  const [{ planName, memberLimit }, count] = await Promise.all([
    getOrgPlanLimits(organizationId),
    getOrganizationMemberCount(organizationId).catch(() => null),
  ]);
  if (count === null) return "Could not check this organization's member limit. Try again.";
  if (!isMemberLimitReached(count, memberLimit)) return null;
  return memberLimitMessage(planName, memberLimit ?? 0);
}

/**
 * Guidon Cloud's people-per-project cap (plans.member_limit_per_project,
 * migration 049), same shape as hostedTaskLimitError.
 */
export async function hostedProjectMemberLimitError(projectId: string, organizationId: string): Promise<string | null> {
  if (hasDirectDatabase()) return null;
  const { createServiceClient } = await import("@/lib/supabase-server");
  const [{ planName, memberLimitPerProject }, { count }] = await Promise.all([
    getOrgPlanLimits(organizationId),
    createServiceClient().from("project_members").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  if (!isMemberLimitReached(count ?? 0, memberLimitPerProject)) return null;
  return `You've reached your ${planName} plan's limit of ${memberLimitPerProject} members per project. Upgrade your plan to add more people.`;
}

/** `limit === null` means unlimited, same convention as the plans table itself. */
export function isTaskLimitReached(currentTaskCount: number, limit: number | null): boolean {
  if (limit === null) return false;
  return currentTaskCount >= limit;
}

/** Same convention: `limit === null` means unlimited. */
export function isMemberLimitReached(currentMemberCount: number, limit: number | null): boolean {
  if (limit === null) return false;
  return currentMemberCount >= limit;
}

/** Same convention: `limit === null` means unlimited. */
export function isStorageLimitReached(currentUsageBytes: number, limit: number | null): boolean {
  if (limit === null) return false;
  return currentUsageBytes >= limit;
}

export function memberLimitMessage(planName: string, limit: number): string {
  const people = limit === 1 ? "person" : "people";
  return `Your ${planName} plan allows ${limit} ${people} in this organization. Upgrade the plan to add more members.`;
}
