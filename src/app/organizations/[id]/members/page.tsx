import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Plus, Shield, Users } from "lucide-react";
import { canManageOrg, requireOrgAccess } from "@/lib/data/org-access";
import { createClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/data/current-user";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { Navigation } from "@/components/layout/navigation";
import { AddMemberDialog } from "./add-member-dialog";
import { MemberActionsMenu } from "./member-actions-menu";

interface MemberRow {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { id: string; email: string; full_name: string | null; avatar_url: string | null };
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  member: "bg-gray-100 text-gray-800",
};

export default async function OrganizationMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: orgId } = await params;
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

    members = (data ?? []).map((member: any) => ({
      id: member.id,
      user_id: member.user_id,
      role: member.role,
      joined_at: member.joined_at,
      profiles: Array.isArray(member.profiles) ? member.profiles[0] : member.profiles,
    }));
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation user={user} />

      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/organizations/${orgId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Organization Members</h1>
            <p className="text-muted-foreground">Manage team members and permissions</p>
          </div>
          {canManage && <AddMemberDialog orgId={orgId} isOwner={access.role === "owner"} />}
        </div>

        {members.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No members yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add team members to collaborate on projects
              </p>
              {canManage && (
                <AddMemberDialog
                  orgId={orgId}
                  isOwner={access.role === "owner"}
                  trigger={
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Member
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <Card key={member.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.profiles.full_name || member.profiles.email}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.profiles.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={ROLE_COLORS[member.role] || ROLE_COLORS.member}>
                      <Shield className="h-3 w-3 mr-1" />
                      {member.role}
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
    </div>
  );
}
