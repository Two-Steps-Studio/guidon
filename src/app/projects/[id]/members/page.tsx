import { requireProjectAccess } from "@/lib/data/project-access";
import { createClient } from "@/lib/supabase-server";
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
  const supabase = await createClient();

  const [memberRes, orgRes] = await Promise.all([
    supabase
      .from("project_members")
      .select("id, user_id, role, joined_at, profiles ( id, full_name, email, avatar_url )")
      .eq("project_id", projectId),
    // Candidates come from the owning organization: project_members.user_id
    // is a FK to profiles, so people must already exist in the workspace.
    supabase
      .from("organization_members")
      .select("user_id, profiles ( id, full_name, email, avatar_url )")
      .eq("organization_id", access.project.organization_id),
  ]);

  const members = (memberRes.data ?? []).map(
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
  const candidates: TaskCardMember[] = (orgRes.data ?? [])
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
