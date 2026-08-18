import { requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { MemberList } from "./member-list";
import type { TaskCardMember } from "@/components/work/task-card";
import type { ProjectRole } from "@/types/project";

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

/** PostgREST types embedded relations as object or array depending on inference. */
function firstProfile(value: ProfileRow | ProfileRow[] | null): ProfileRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ProjectMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);

  type Member = {
    id: string;
    user_id: string;
    role: ProjectRole;
    joined_at: string;
    profile: ProfileRow | null;
  };

  let members: Member[];
  let candidates: TaskCardMember[];

  if (hasDirectDatabase()) {
    const [memberRows, orgRows] = await withUser(access.userId, ({ query }) =>
      Promise.all([
        query(
          `SELECT pm.id, pm.user_id, pm.role, pm.joined_at,
                  p.id AS profile_id, p.full_name, p.email, p.avatar_url
           FROM project_members pm
           LEFT JOIN profiles p ON p.id = pm.user_id
           WHERE pm.project_id = $1`,
          [projectId]
        ),
        // Candidates come from the owning organization: project_members.user_id
        // is a FK to profiles, so people must already exist in the workspace.
        query(
          `SELECT om.user_id, p.id AS profile_id, p.full_name, p.email, p.avatar_url
           FROM organization_members om
           LEFT JOIN profiles p ON p.id = om.user_id
           WHERE om.organization_id = $1`,
          [access.project.organization_id]
        ),
      ])
    );

    members = memberRows.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      role: row.role as ProjectRole,
      joined_at: row.joined_at,
      profile: row.profile_id
        ? { id: row.profile_id, full_name: row.full_name, email: row.email, avatar_url: row.avatar_url }
        : null,
    }));

    const onProjectLocal = new Set(members.map((r) => r.user_id));
    candidates = orgRows.rows
      .map((row) => ({
        id: row.profile_id ?? row.user_id,
        full_name: row.full_name ?? null,
        email: row.email ?? "Unknown member",
        avatar_url: row.avatar_url ?? null,
      }))
      .filter((candidate) => !onProjectLocal.has(candidate.id));
  } else {
    const supabase = await createClient();

    const [memberRes, orgRes] = await Promise.all([
      supabase
        .from("project_members")
        .select("id, user_id, role, joined_at, profiles ( id, full_name, email, avatar_url )")
        .eq("project_id", projectId),
      supabase
        .from("organization_members")
        .select("user_id, profiles ( id, full_name, email, avatar_url )")
        .eq("organization_id", access.project.organization_id),
    ]);

    members = (memberRes.data ?? []).map(
      (row: { id: string; user_id: string; role: string; joined_at: string; profiles: ProfileRow | ProfileRow[] | null }) => {
        const profile = firstProfile(row.profiles);
        return {
          id: row.id,
          user_id: row.user_id,
          role: row.role as ProjectRole,
          joined_at: row.joined_at,
          profile: profile
            ? {
                id: profile.id,
                full_name: profile.full_name,
                email: profile.email,
                avatar_url: profile.avatar_url,
              }
            : null,
        };
      }
    );

    const onProject = new Set(members.map((r) => r.user_id));
    candidates = (orgRes.data ?? [])
      .map((row: { user_id: string; profiles: ProfileRow | ProfileRow[] | null }) => {
        const profile = firstProfile(row.profiles);
        return {
          id: profile?.id ?? row.user_id,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? "Unknown member",
          avatar_url: profile?.avatar_url ?? null,
        };
      })
      .filter((candidate) => !onProject.has(candidate.id));
  }

  return (
    <MemberList
      projectId={projectId}
      currentUserId={access.userId}
      myRole={access.role}
      initialMembers={members}
      initialCandidates={candidates}
    />
  );
}
