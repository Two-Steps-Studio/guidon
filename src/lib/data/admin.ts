import "server-only";

import { serviceDataClient } from "@/lib/data-client";

/**
 * Cross-tenant queries for the admin panel (TODO.md §25).
 *
 * Everything here runs through serviceDataClient() - withServiceRole()
 * self-hosted, createServiceClient() on Supabase - because an admin view of
 * "every organization" or "every user" is definitionally a cross-tenant
 * read that RLS is designed to prevent for anyone else.
 *
 * This is only safe because every caller sits behind requireAdminAccess()
 * (src/lib/data/admin-access.ts), which every admin page calls before any
 * function here runs. Nothing in this file re-checks that gate - it isn't
 * the boundary, it relies on one already having run.
 */

/** A self-hosted instance is not going to have thousands of orgs or users; capped rather than paginated for v1. */
const LIST_LIMIT = 200;

export interface AdminCounts {
  organizations: number;
  projects: number;
  users: number;
}

export async function getAdminCounts(): Promise<AdminCounts> {
  const db = serviceDataClient();
  const [organizations, projects, users] = await Promise.all([
    db.from("organizations").count(),
    db.from("projects").count(),
    db.from("profiles").count(),
  ]);
  return { organizations: organizations.data, projects: projects.data, users: users.data };
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  project_limit: number;
  planId: string;
  planName: string;
  memberCount: number;
  owner: { email: string; full_name: string | null } | null;
}

/**
 * Organizations across the whole instance: name, slug, owner, member count,
 * plan. Members, their profiles, subscriptions and plan names are four
 * batched lookups by id - never one query per organization.
 */
export async function listOrganizationsForAdmin(): Promise<{
  rows: AdminOrganizationRow[];
  truncated: boolean;
}> {
  const db = serviceDataClient();

  const { data: organizations } = await db
    .from<{ id: string; name: string; slug: string; created_at: string; project_limit: number }>("organizations")
    .select("id, name, slug, project_limit, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (organizations.length === 0) return { rows: [], truncated: false };

  const orgIds = organizations.map((org) => org.id);
  const [{ data: members }, { data: subscriptions }, { data: plans }] = await Promise.all([
    db
      .from<{ organization_id: string; user_id: string; role: string }>("organization_members")
      .select("organization_id, user_id, role")
      .in("organization_id", orgIds),
    db.from<{ organization_id: string; plan_id: string }>("subscriptions").select("organization_id, plan_id").in("organization_id", orgIds),
    db.from<{ id: string; name: string }>("plans").select("id, name"),
  ]);

  const ownerIds = [...new Set(members.filter((m) => m.role === "owner").map((m) => m.user_id))];
  const owners = await resolveProfilesForAdmin(ownerIds);
  const profileById = new Map(owners.map((p) => [p.id, { email: p.email, full_name: p.full_name }]));
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const planIdByOrg = new Map(subscriptions.map((s) => [s.organization_id, s.plan_id]));

  const countByOrg = new Map<string, number>();
  const ownerByOrg = new Map<string, { email: string; full_name: string | null }>();
  for (const member of members) {
    countByOrg.set(member.organization_id, (countByOrg.get(member.organization_id) ?? 0) + 1);
    const profile = profileById.get(member.user_id);
    if (member.role === "owner" && profile && !ownerByOrg.has(member.organization_id)) {
      ownerByOrg.set(member.organization_id, profile);
    }
  }

  const rows: AdminOrganizationRow[] = organizations.map((org) => {
    const planId = planIdByOrg.get(org.id) ?? "free";
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      created_at: org.created_at,
      project_limit: org.project_limit,
      planId,
      planName: planName.get(planId) ?? "Free",
      memberCount: countByOrg.get(org.id) ?? 0,
      owner: ownerByOrg.get(org.id) ?? null,
    };
  });

  return { rows, truncated: organizations.length === LIST_LIMIT };
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export async function listUsersForAdmin(): Promise<{
  rows: AdminUserRow[];
  truncated: boolean;
}> {
  const { data: rows } = await serviceDataClient()
    .from<AdminUserRow>("profiles")
    .select("id, email, full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  return { rows, truncated: rows.length === LIST_LIMIT };
}

export interface AdminActivityRow {
  id: string;
  project_id: string | null;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  actor_label: string | null;
}

/**
 * Instance-wide activity, most recent first - the same activity_logs table
 * src/lib/data/activity.ts reads per-project, without the project_id filter.
 */
export async function listRecentActivityForAdmin(limit = 100): Promise<AdminActivityRow[]> {
  const { data } = await serviceDataClient()
    .from<AdminActivityRow>("activity_logs")
    .select("id, project_id, organization_id, user_id, action, entity_type, entity_id, created_at, actor_label")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data;
}

export interface AdminActorProfile {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Resolves user ids (e.g. activity_logs.user_id, ON DELETE SET NULL) to
 * display names - service role because this spans every tenant's users.
 */
export async function resolveProfilesForAdmin(userIds: string[]): Promise<AdminActorProfile[]> {
  if (userIds.length === 0) return [];
  const { data } = await serviceDataClient()
    .from<AdminActorProfile>("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  return data;
}

export interface AdminFeedbackRow {
  id: string;
  user_id: string | null;
  message: string;
  page_url: string | null;
  created_at: string;
}

/**
 * Instance-wide feedback, most recent first - the "Send feedback" entry in
 * the profile menu (src/app/feedback/actions.ts) writes here.
 */
export async function listFeedbackForAdmin(limit = 200): Promise<AdminFeedbackRow[]> {
  const { data } = await serviceDataClient()
    .from<AdminFeedbackRow>("feedback")
    .select("id, user_id, message, page_url, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data;
}
