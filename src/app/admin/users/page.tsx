import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listUsersForAdmin } from "@/lib/data/admin";

export default async function AdminUsersPage() {
  await requireAdminAccess();

  const { rows, truncated } = await listUsersForAdmin();

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">Users</h2>
        <p className="text-muted-foreground">
          {rows.length} user{rows.length === 1 ? "" : "s"} across this instance
          {truncated ? ` (capped at ${rows.length} for this v1 view — no pagination yet)` : ""}.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No users yet</h3>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>Email</th>
                  <th>Full name</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((user) => (
                  <tr key={user.id} className="[&>td]:px-4 [&>td]:py-3">
                    <td className="font-medium">{user.email}</td>
                    <td className="text-muted-foreground">{user.full_name || "—"}</td>
                    <td className="text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</td>
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
