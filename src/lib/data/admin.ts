import "server-only";

import { createServiceClient } from "@/lib/supabase-server";

/**
 * Cross-tenant queries for the admin panel (TODO.md §25).
 *
 * Every function here uses createServiceClient() (src/lib/supabase-server.ts)
 * — the same service-role client already used elsewhere for privileged reads
 * (e.g. getProjectStorageUsage in src/lib/storage/storage.ts) — because an
 * admin view of "every organization" or "every user" is definitionally a
 * cross-tenant read that RLS is designed to prevent for anyone else.
 *
 * This is only safe because every caller sits behind requireAdminAccess()
 * (src/lib/data/admin-access.ts), which every admin page calls before any
 * function here runs. Nothing in this file re-checks that gate — it isn't
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
  const supabase = createServiceClient();

  const [orgs, projects, users] = await Promise.all([
    supabase.from("organizations").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  return {
    organizations: orgs.count ?? 0,
    projects: projects.count ?? 0,
    users: users.count ?? 0,
  };
}

export interface AdminOrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  memberCount: number;
  owner: { email: string; full_name: string | null } | null;
}

interface OrganizationMemberJoinRow {
  organization_id: string;
  role: string;
  profiles: { email: string; full_name: string | null } | null;
}

/**
 * Organizations across the whole instance: name, slug, owner, member count,
 * created_at. Owner is resolved via organization_members where role='owner'
 * (organization_members_user_id_fkey references profiles — 001_initial_schema.sql),
 * joined in one extra query rather than N+1 per organization.
 */
export async function listOrganizationsForAdmin(): Promise<{
  rows: AdminOrganizationRow[];
  truncated: boolean;
}> {
  const supabase = createServiceClient();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  const organizations = orgs ?? [];
  if (organizations.length === 0) {
    return { rows: [], truncated: false };
  }

  const orgIds = organizations.map((org) => org.id);
  const { data: members } = await supabase
    .from("organization_members")
    .select("organization_id, role, profiles(email, full_name)")
    .in("organization_id", orgIds);

  const memberRows = (members ?? []) as unknown as OrganizationMemberJoinRow[];

  const countByOrg = new Map<string, number>();
  const ownerByOrg = new Map<string, { email: string; full_name: string | null }>();

  for (const member of memberRows) {
    countByOrg.set(member.organization_id, (countByOrg.get(member.organization_id) ?? 0) + 1);
    if (member.role === "owner" && member.profiles && !ownerByOrg.has(member.organization_id)) {
      ownerByOrg.set(member.organization_id, member.profiles);
    }
  }

  const rows: AdminOrganizationRow[] = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    created_at: org.created_at,
    memberCount: countByOrg.get(org.id) ?? 0,
    owner: ownerByOrg.get(org.id) ?? null,
  }));

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
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  const rows = (data ?? []) as AdminUserRow[];
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
}

/**
 * Instance-wide activity, most recent first — the same activity_logs table
 * src/lib/data/activity.ts reads per-project, without the project_id filter.
 *
 * Nothing in this codebase currently inserts into activity_logs (see the
 * comment in src/lib/data/activity.ts), so this reads whatever exists
 * without assuming any particular action vocabulary is enforced.
 */
export async function listRecentActivityForAdmin(limit = 100): Promise<AdminActivityRow[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("activity_logs")
    .select("id, project_id, organization_id, user_id, action, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as AdminActivityRow[];
}
