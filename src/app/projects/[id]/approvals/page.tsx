import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { listApprovalRequests } from "@/lib/data/agent-approvals";
import { dataClient } from "@/lib/data-client";
import { ApprovalInbox } from "./approval-inbox";

export default async function ProjectApprovalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const t = await getTranslations("approvals");
  const access = await requireProjectAccess(projectId);
  const requests = await listApprovalRequests(access.userId, projectId);

  const people = [...new Set(requests.flatMap((request) => [request.requested_by, request.decided_by]).filter(Boolean))] as string[];
  const { data: profiles } = people.length
    ? await dataClient(access.userId)
        .from<{ id: string; full_name: string | null; email: string | null }>("profiles")
        .select("id, full_name, email")
        .in("id", people)
    : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || ""]));

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      {requests.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ApprovalInbox
          projectId={projectId}
          requests={requests}
          names={names}
          canDecide={canManageProject(access.role)}
        />
      )}
    </div>
  );
}
