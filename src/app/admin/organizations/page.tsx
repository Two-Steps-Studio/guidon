import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listOrganizationsForAdmin } from "@/lib/data/admin";
import { ProjectLimitEditor } from "./project-limit-editor";

export default async function AdminOrganizationsPage() {
  await requireAdminAccess();

  const { rows, truncated } = await listOrganizationsForAdmin();

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">Organizations</h2>
        <p className="text-muted-foreground">
          {rows.length} organization{rows.length === 1 ? "" : "s"} across this instance
          {truncated ? ` (capped at ${rows.length} for this v1 view — no pagination yet)` : ""}.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations yet"
          description="Organizations created on this instance will show up here."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Owner</th>
                  <th>Members</th>
                  <th>Created</th>
                  <th>Project limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((org) => (
                  <tr key={org.id} className="[&>td]:px-4 [&>td]:py-3 hover:bg-surface-hover">
                    <td className="font-medium">{org.name}</td>
                    <td className="font-mono text-xs text-muted-foreground">{org.slug}</td>
                    <td>{org.owner ? org.owner.full_name || org.owner.email : "—"}</td>
                    <td>{org.memberCount}</td>
                    <td className="text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</td>
                    <td>
                      <ProjectLimitEditor orgId={org.id} initialLimit={org.project_limit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
