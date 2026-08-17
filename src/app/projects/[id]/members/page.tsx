"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Loader2, UserMinus, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { initialsFor, type TaskCardMember } from "@/components/work/task-card";
import type { ProjectRole } from "@/types/project";

/**
 * Roles each actor may assign, mirroring the RLS policies exactly:
 *
 *   project_members_insert_owner : project_role = 'owner'        (any role)
 *   project_members_insert_admin : project_role = 'admin'        (not owner)
 *
 * The UI offers only what the database will accept, so a member edit never
 * fails with a raw policy violation.
 */
const ASSIGNABLE_BY: Record<"owner" | "admin", ProjectRole[]> = {
  owner: ["owner", "admin", "developer", "tester", "viewer"],
  admin: ["admin", "developer", "tester", "viewer"],
};

const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  tester: "Tester",
  viewer: "Viewer",
};

const ROLE_HINTS: Record<ProjectRole, string> = {
  owner: "Full control, including deleting the project",
  admin: "Manage members, settings, roadmap and files",
  developer: "Create and edit tasks, decisions and knowledge",
  tester: "Comment on tasks; read everything else",
  viewer: "Read-only access",
};

interface ProjectMemberRow {
  id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
  profile: TaskCardMember | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

/** PostgREST types embedded relations as object or array depending on inference. */
function firstProfile(value: ProfileRow | ProfileRow[] | null): ProfileRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function ProjectMembersPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [members, setMembers] = useState<ProjectMemberRow[]>([]);
  const [candidates, setCandidates] = useState<TaskCardMember[]>([]);
  const [myRole, setMyRole] = useState<ProjectRole | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setError(null);
      setForbidden(false);

      if (!user) {
        setForbidden(true);
        return;
      }
      setCurrentUserId(user.id);

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, organization_id")
        .eq("id", projectId)
        .maybeSingle();

      if (projectError) throw projectError;
      if (!project) {
        setForbidden(true);
        return;
      }

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
          .eq("organization_id", project.organization_id),
      ]);

      if (memberRes.error) throw memberRes.error;

      const rows: ProjectMemberRow[] = (memberRes.data ?? []).map(
        (row: {
          id: string;
          user_id: string;
          role: string;
          joined_at: string;
          profiles: ProfileRow | ProfileRow[] | null;
        }) => {
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

      const onProject = new Set(rows.map((r) => r.user_id));
      const available: TaskCardMember[] = (orgRes.data ?? [])
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

      setMembers(rows);
      setCandidates(available);
      setMyRole(
        (rows.find((r) => r.user_id === user.id)?.role as ProjectRole) ?? null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // See ../work/page.tsx: state is only touched after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const canManage = myRole === "owner" || myRole === "admin";
  const assignable = canManage ? ASSIGNABLE_BY[myRole as "owner" | "admin"] : [];

  const ownerCount = useMemo(
    () => members.filter((m) => m.role === "owner").length,
    [members]
  );

  /** Mirrors the protect_project_owner trigger so the UI never offers an action the database will reject. */
  const isLastOwner = (member: ProjectMemberRow) =>
    member.role === "owner" && ownerCount === 1;

  /** Admins may not touch owners (project_members_update_admin / _delete_admin). */
  const canEdit = (member: ProjectMemberRow) =>
    canManage && !(myRole === "admin" && member.role === "owner");

  const changeRole = async (member: ProjectMemberRow, role: ProjectRole) => {
    setBusyId(member.id);
    setError(null);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("project_members")
        .update({ role })
        .eq("id", member.id);

      if (updateError) throw updateError;

      setMembers((current) =>
        current.map((m) => (m.id === member.id ? { ...m, role } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change that role");
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (member: ProjectMemberRow) => {
    setBusyId(member.id);
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("project_members")
        .delete()
        .eq("id", member.id);

      if (deleteError) throw deleteError;

      setMembers((current) => current.filter((m) => m.id !== member.id));
      if (member.profile) {
        setCandidates((current) => [...current, member.profile!]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove that member"
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <ProjectSidebar projectId={projectId}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading members...
          </p>
        </div>
      </ProjectSidebar>
    );
  }

  if (forbidden) {
    return (
      <ProjectSidebar projectId={projectId}>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-base font-medium text-foreground">
              You don&apos;t have permission to access this project
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask an owner or admin of the project to add you as a member.
            </p>
          </div>
        </div>
      </ProjectSidebar>
    );
  }

  return (
    <ProjectSidebar projectId={projectId}>
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Members
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Who can see and change this project.
              {" · "}
              <span className="tabular-nums">{members.length}</span>
            </p>
          </div>

          {canManage && (
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              disabled={candidates.length === 0}
              title={
                candidates.length === 0
                  ? "Everyone in the organization is already on this project"
                  : undefined
              }
            >
              <UserPlus className="h-4 w-4" />
              Add member
            </Button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {!canManage && myRole && (
          <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            You have <strong className="font-medium">{myRole}</strong> access —
            only owners and admins can change membership.
          </p>
        )}

        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {members.map((member) => {
            const name =
              member.profile?.full_name || member.profile?.email || "Unknown member";
            const editable = canEdit(member);
            const lastOwner = isLastOwner(member);

            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-3 bg-card p-3"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
                >
                  {member.profile ? initialsFor(member.profile) : "?"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {name}
                    {member.user_id === currentUserId && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        you
                      </span>
                    )}
                  </p>
                  {member.profile?.full_name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {member.profile.email}
                    </p>
                  )}
                </div>

                {editable && !lastOwner ? (
                  <Select
                    aria-label={`Role for ${name}`}
                    className="h-8 w-36"
                    value={member.role}
                    disabled={busyId === member.id}
                    onChange={(event) =>
                      void changeRole(member, event.target.value as ProjectRole)
                    }
                  >
                    {/* Keep the current role selectable even if this actor could not assign it. */}
                    {Array.from(new Set([member.role, ...assignable])).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
                    title={lastOwner ? "A project must keep one owner" : undefined}
                  >
                    {ROLE_LABELS[member.role]}
                  </span>
                )}

                {editable && !lastOwner && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${name}`}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={busyId === member.id}
                    onClick={() => void removeMember(member)}
                  >
                    {busyId === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {members.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            A project always keeps at least one owner — the last one cannot be
            removed or demoted.
          </p>
        )}
      </div>

      {adding && (
        <AddMemberDialog
          projectId={projectId}
          candidates={candidates}
          assignable={assignable}
          onClose={() => setAdding(false)}
          onAdded={(row, profile) => {
            setMembers((current) => [...current, { ...row, profile }]);
            setCandidates((current) =>
              current.filter((c) => c.id !== row.user_id)
            );
            setAdding(false);
          }}
        />
      )}
    </ProjectSidebar>
  );
}

function AddMemberDialog({
  projectId,
  candidates,
  assignable,
  onClose,
  onAdded,
}: {
  projectId: string;
  candidates: TaskCardMember[];
  assignable: ProjectRole[];
  onClose: () => void;
  onAdded: (
    row: Omit<ProjectMemberRow, "profile">,
    profile: TaskCardMember | null
  ) => void;
}) {
  const [userId, setUserId] = useState(candidates[0]?.id ?? "");
  const [role, setRole] = useState<ProjectRole>(
    assignable.includes("developer") ? "developer" : assignable[0]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("project_members")
        .insert({ project_id: projectId, user_id: userId, role })
        .select("id, user_id, role, joined_at")
        .single();

      if (insertError) throw insertError;

      onAdded(
        data as Omit<ProjectMemberRow, "profile">,
        candidates.find((c) => c.id === userId) ?? null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add member</DialogTitle>
          <DialogDescription>
            People must already belong to the organization that owns this
            project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-user">Person</Label>
            <Select
              id="member-user"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.full_name || candidate.email}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-role">Role</Label>
            <Select
              id="member-role"
              value={role}
              onChange={(event) => setRole(event.target.value as ProjectRole)}
            >
              {assignable.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !userId}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Add member
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
