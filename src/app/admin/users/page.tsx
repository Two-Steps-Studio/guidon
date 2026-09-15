import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listUsersForAdmin } from "@/lib/data/admin";

export default async function AdminUsersPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin");

  const { rows, truncated } = await listUsersForAdmin();

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">{t("usersTitle")}</h2>
        <p className="text-muted-foreground">
          {t("usersCount", { count: rows.length })}
          {truncated ? t("cappedSuffix", { count: rows.length }) : ""}.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t("noUsersYet")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>{t("colEmail")}</th>
                  <th>{t("colFullName")}</th>
                  <th>{t("colCreated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((user) => (
                  <tr key={user.id} className="[&>td]:px-4 [&>td]:py-3 hover:bg-surface-hover">
                    <td className="font-medium">{user.email}</td>
                    <td className="text-muted-foreground">{user.full_name || "-"}</td>
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
