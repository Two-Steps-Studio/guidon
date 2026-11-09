import { getTranslations } from "next-intl/server";
import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { listBriefVersions } from "@/lib/data/agent-brief";
import { dataClient } from "@/lib/data-client";
import { AgentBriefEditor } from "./agent-brief-editor";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function AgentBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const t = await getTranslations("agentBrief");
  const access = await requireProjectAccess(projectId);
  const versions = await listBriefVersions(access.userId, projectId);

  const approvers = [...new Set(versions.map((version) => version.approved_by).filter(Boolean))] as string[];
  const { data: profiles } = approvers.length
    ? await dataClient(access.userId).from<{ id: string; full_name: string | null; email: string | null }>("profiles").select("id, full_name, email").in("id", approvers)
    : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || ""]));

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* A file download, not a page: a plain anchor so the browser saves it. */}
          <Button asChild variant="outline" size="sm">
            <a href={`/projects/${projectId}/brief/agents.md`} download="AGENTS.md">
              <Download className="h-4 w-4" aria-hidden />
              {t("exportAgentsMd")}
            </a>
          </Button>
          <span className="text-sm text-muted-foreground">{t("exportAgentsMdHint")}</span>
        </div>
      </div>
      <AgentBriefEditor projectId={projectId} versions={versions} names={names} canApprove={canManageProject(access.role)} />
    </div>
  );
}
