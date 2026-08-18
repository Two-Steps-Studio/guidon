"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Loader2, UserMinus, UserPlus } from "lucide-react";
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
import { initialsFor, type TaskCardMember } from "@/components/work/task-card";
import { addMember, changeMemberRole, removeMember, type MemberRow } from "./actions";
import type { ProjectRole } from "@/types/project";

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

export function MemberList({
  projectId,
  currentUserId,
  myRole,
  initialMembers,
  initialCandidates,
}: {
  projectId: string;
  currentUserId: string;
  myRole: ProjectRole | null;
  initialMembers: ProjectMemberRow[];
  initialCandidates: TaskCardMember[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = myRole === "owner" || myRole === "admin";
  const assignable = canManage ? ASSIGNABLE_BY[myRole as "owner" | "admin"] : [];

  const ownerCount = useMemo(() => members.filter((m) => m.role === "owner").length, [members]);

  /** Mirrors the protect_project_owner trigger so the UI never offers an action the database will reject. */
  const isLastOwner = (member: ProjectMemberRow) => member.role === "owner" && ownerCount === 1;

  /** Admins may not touch owners (project_members_update_admin / _delete_admin). */
  const canEdit = (member: ProjectMemberRow) =>
    canManage && !(myRole === "admin" && member.role === "owner");

  const handleChangeRole = async (member: ProjectMemberRow, role: ProjectRole) => {
    setBusyId(member.id);
    setError(null);

    const result = await changeMemberRole(projectId, member.id, member.role, role);
    if (result.error) {
      setError(result.error);
    } else {
      setMembers((current) => current.map((m) => (m.id === member.id ? { ...m, role } : m)));
    }
    setBusyId(null);
  };

  const handleRemove = async (member: ProjectMemberRow) => {
    setBusyId(member.id);
    setError(null);

    const result = await removeMember(projectId, member.id, member.role);
    if (result.error) {
      setError(result.error);
    } else {
      setMembers((current) => current.filter((m) => m.id !== member.id));
      if (member.profile) {
        setCandidates((current) => [...current, member.profile!]);
      }
    }
    setBusyId(null);
  };

  return (
    <>
      <div className="mx-auto max-w-3xl p-6">
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Members</h1>
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
            <button type="button" onClick={() => setError(null)} className="underline underline-offset-2">
              Dismiss
            </button>
          </div>
        )}

        {!canManage && myRole && (
          <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            You have <strong className="font-medium">{myRole}</strong> access — only owners and admins
            can change membership.
          </p>
        )}

        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {members.map((member) => {
            const name = member.profile?.full_name || member.profile?.email || "Unknown member";
            const editable = canEdit(member);
            const lastOwner = isLastOwner(member);

            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 bg-card p-3">
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
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">you</span>
                    )}
                  </p>
                  {member.profile?.full_name && (
                    <p className="truncate text-xs text-muted-foreground">{member.profile.email}</p>
                  )}
                </div>

                {editable && !lastOwner ? (
                  <Select
                    aria-label={`Role for ${name}`}
                    className="h-8 w-36"
                    value={member.role}
                    disabled={busyId === member.id}
                    onChange={(event) => void handleChangeRole(member, event.target.value as ProjectRole)}
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
                    onClick={() => void handleRemove(member)}
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
            A project always keeps at least one owner — the last one cannot be removed or demoted.
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
            setCandidates((current) => current.filter((c) => c.id !== row.user_id));
            setAdding(false);
          }}
        />
      )}
    </>
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
  onAdded: (row: MemberRow, profile: TaskCardMember | null) => void;
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

    const result = await addMember(projectId, userId, role);

    if (result.error || !result.member) {
      setError(result.error ?? "Could not add that member");
      setSubmitting(false);
      return;
    }

    onAdded(result.member, candidates.find((c) => c.id === userId) ?? null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add member</DialogTitle>
          <DialogDescription>
            People must already belong to the organization that owns this project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-user">Person</Label>
            <Select id="member-user" value={userId} onChange={(event) => setUserId(event.target.value)}>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.full_name || candidate.email}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-role">Role</Label>
            <Select id="member-role" value={role} onChange={(event) => setRole(event.target.value as ProjectRole)}>
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
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
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
