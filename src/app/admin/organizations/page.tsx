import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listOrganizationsForAdmin } from "@/lib/data/admin";
import { ProjectLimitEditor } from "./project-limit-editor";
import { PlanEditor } from "./plan-editor";

export default async function AdminOrganizationsPage() {
  await requireAdminAccess();
  const t = await getTranslations("admin");

  const { rows, truncated } = await listOrganizationsForAdmin();

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-6 py-8">
      <div>
        <h2 className="text-2xl font-bold">{t("organizations")}</h2>
        <p className="text-muted-foreground">
          {truncated
            ? t("orgsCountSubtitleTruncated", { count: rows.length })
            : t("orgsCountSubtitle", { count: rows.length })}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("orgsEmptyTitle")}
          description={t("orgsEmptyDescription")}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th>{t("colName")}</th>
                  <th>{t("colSlug")}</th>
                  <th>{t("colOwner")}</th>
                  <th>{t("colMembers")}</th>
                  <th>{t("colCreated")}</th>
                  <th>{t("colProjectLimit")}</th>
                  <th>{t("colPlan")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((org) => (
                  <tr key={org.id} className="[&>td]:px-4 [&>td]:py-3 hover:bg-surface-hover">
                    <td className="font-medium">{org.name}</td>
                    <td className="font-mono text-xs text-muted-foreground">{org.slug}</td>
                    <td>{org.owner ? org.owner.full_name || org.owner.email : "-"}</td>
                    <td>{org.memberCount}</td>
                    <td className="text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</td>
                    <td>
                      <ProjectLimitEditor orgId={org.id} initialLimit={org.project_limit} />
                    </td>
                    <td>
                      <PlanEditor orgId={org.id} initialPlanId={org.planId} />
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
