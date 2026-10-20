import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Bot, Mail, Plus, Shield, Users } from "lucide-react";
import { canManageOrg, requireOrgAccess } from "@/lib/data/org-access";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { AppShell } from "@/components/layout/app-shell";
import { getOrgPlanLimits, isMemberLimitReached } from "@/lib/limits";
import { AddMemberDialog } from "./add-member-dialog";
import { MemberActionsMenu } from "./member-actions-menu";
import { MembersTree, type TreeProject } from "./members-tree";
import { dataClient } from "@/lib/data-client";
import { isAiAccountEmail } from "@/lib/ai-account-email";

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { id: string; email: string; full_name: string | null; avatar_url: string | null };
}

/** Raw shape of the Supabase-hosted branch's row - `profiles` comes back as an array or a single object depending on how supabase-js infers the join's cardinality, resolved into MemberRow's single-object shape right below. */
interface SupabaseMemberRow {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: MemberRow["profiles"] | MemberRow["profiles"][] | null;
}

export default async function OrganizationMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id: orgId } = await params;
  const view = (await searchParams).view === "list" ? "list" : "tree";
  const t = await getTranslations("organizations.members");
  const tCommon = await getTranslations("organizations.common");
  const tAi = await getTranslations("aiAccounts");
  const [access, user] = await Promise.all([requireOrgAccess(orgId), getCurrentUser()]);
  const canManage = canManageOrg(access.role);

  let members: MemberRow[];

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query(
        `SELECT om.id, om.user_id, om.role, om.joined_at,
                p.id AS profile_id, p.email, p.full_name, p.avatar_url
         FROM organization_members om
         LEFT JOIN profiles p ON p.id = om.user_id
         WHERE om.organization_id = $1
         ORDER BY om.joined_at ASC`,
        [orgId]
      )
    );
    members = result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      profiles: { id: row.profile_id, email: row.email, full_name: row.full_name, avatar_url: row.avatar_url },
    }));
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organization_members")
      .select("id, user_id, role, joined_at, profiles (id, email, full_name, avatar_url)")
      .eq("organization_id", orgId)
      .order("joined_at", { ascending: true });

    members = ((data ?? []) as unknown as SupabaseMemberRow[]).map((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return {
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        joined_at: member.joined_at,
        // Falls back to an all-empty profile rather than null - a member row
        // with no matching profiles row is the same edge case the direct-DB
        // branch above already handles via its LEFT JOIN (columns come back
        // null, not the whole `profiles` object), so this keeps MemberRow's
        // `profiles` field non-nullable on both branches.
        profiles: profile ?? { id: member.user_id, email: "", full_name: null, avatar_url: null },
      };
    });
  }

  // Guidon Cloud seats (plans.member_limit, migration 049) - self-hosted has
  // no plans. members.length is every organization_members row the caller
  // can see, which for any member of the organization is all of them.
  const seats = hasDirectDatabase() ? null : await getOrgPlanLimits(orgId);

  // The tree also shows who's on which project (only projects the viewer
  // can see - RLS; their teams since migration 069).
  let treeProjects: TreeProject[] = [];
  if (view === "tree" && members.length > 0) {
    const db = dataClient(access.userId);
    const { data: projects } = await db
      .from<{ id: string; name: string }>("projects")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });
    const { data: projectMembers } = projects.length
      ? await db
          .from<{ project_id: string; user_id: string; role: string }>("project_members")
          .select("project_id, user_id, role")
          .in("project_id", projects.map((project) => project.id))
      : { data: [] as { project_id: string; user_id: string; role: string }[] };
    treeProjects = projects.map((project) => ({
      id: project.id,
      name: project.name,
      roles: new Map(projectMembers.filter((row) => row.project_id === project.id).map((row) => [row.user_id, row.role])),
    }));
  }
  const seatsFull = seats !== null && isMemberLimitReached(members.length, seats.memberLimit);

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/organizations/${orgId}`} aria-label={t("backToOrganization")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1 basis-48">
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">{t("subtitle")}</p>
            {seats && seats.memberLimit !== null && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("seatsUsed", { used: members.length, limit: seats.memberLimit, plan: seats.planName })}
              </p>
            )}
          </div>
          {canManage && !seatsFull && <AddMemberDialog orgId={orgId} isOwner={access.role === "owner"} />}
          {canManage && seatsFull && (
            <Button asChild variant="outline">
              <Link href={`/organizations/${orgId}/billing`}>{t("upgradeForSeats")}</Link>
            </Button>
          )}
        </div>

        {seatsFull && seats && (
          <Card className="mb-6 border-warning/40 bg-warning/5">
            <CardContent className="py-4 text-sm">
              {t("seatsFull", { limit: seats.memberLimit ?? 0, plan: seats.planName })}
            </CardContent>
          </Card>
        )}

        {members.length > 0 && (
          <div role="tablist" aria-label={t("title")} className="mb-4 inline-flex rounded-md bg-muted p-1 text-sm">
            {(["tree", "list"] as const).map((option) => (
              <Link
                key={option}
                role="tab"
                aria-selected={view === option}
                href={option === "tree" ? `/organizations/${orgId}/members` : `/organizations/${orgId}/members?view=list`}
                className={
                  view === option
                    ? "rounded px-3 py-1 font-medium bg-background shadow-sm"
                    : "rounded px-3 py-1 text-muted-foreground hover:text-foreground"
                }
              >
                {option === "tree" ? t("viewTree") : t("viewList")}
              </Link>
            ))}
          </div>
        )}

        {members.length > 0 && view === "tree" ? (
          <MembersTree
            orgId={orgId}
            orgName={access.organization.name}
            members={members.map((member) => ({
              userId: member.user_id,
              role: member.role,
              name: member.profiles.full_name || member.profiles.email,
              email: member.profiles.email,
            }))}
            projects={treeProjects}
          />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              canManage ? (
                <AddMemberDialog
                  orgId={orgId}
                  isOwner={access.role === "owner"}
                  trigger={
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      {t("addMember")}
                    </Button>
                  }
                />
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <Card key={member.id}>
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                      {isAiAccountEmail(member.profiles.email) ? (
                        <Bot className="h-5 w-5 text-primary" />
                      ) : (
                        <Mail className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {member.profiles.full_name || member.profiles.email}
                        {isAiAccountEmail(member.profiles.email) && <Badge variant="outline">{tAi("aiBadge")}</Badge>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {isAiAccountEmail(member.profiles.email) ? (
                          <Link href={`/organizations/${orgId}/ai-accounts`} className="hover:underline">
                            {tAi("title")}
                          </Link>
                        ) : (
                          member.profiles.email
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                    <Badge variant={member.role === "owner" ? "default" : member.role === "admin" ? "secondary" : "outline"}>
                      <Shield className="h-3 w-3 mr-1" />
                      {tCommon("role", { role: member.role })}
                    </Badge>
                    {canManage && (
                      <MemberActionsMenu
                        orgId={orgId}
                        memberId={member.id}
                        isOwner={access.role === "owner"}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
