import { getTranslations } from "next-intl/server";
import { canManageProject, canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { SITE_URL } from "@/lib/site-url";
import { getLabelPresets } from "@/lib/data/label-presets";
import { createClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { DangerZoneCard } from "./danger-zone-card";
import { SettingsForm } from "./settings-form";
import { AiPermissionsForm } from "./ai-permissions-form";
import { BoardColumnsForm, PrioritiesForm } from "./board-columns-form";
import { getWorkflowOverrides } from "@/lib/data/workflow";
import { LabelPresetsForm } from "./label-presets-form";
import { ModulesForm } from "./modules-form";
import { ReportWidgetCard } from "./report-widget-card";
import { listReportWidgetKeys } from "@/app/profile/api-keys-actions";
import { ExportProjectCard } from "./export-project-card";
import { FinishedTasksForm } from "./finished-tasks-form";
import { DiscordIntegrationForm } from "./discord-integration-form";
import { getDiscordIntegrationInfo } from "@/lib/data/discord-integration";
import type { Project } from "@/types/project";
import type { Technology } from "@/types/technology";
import { showAi } from "@/lib/data/ai-preference";

interface AiPermissionsRow {
  can_read_context: boolean;
  can_create_comments: boolean;
  can_change_status: boolean;
  can_complete_tasks: boolean;
  can_modify_settings: boolean;
  can_delete_tasks: boolean;
}

const DEFAULT_AI_PERMISSIONS: AiPermissionsRow = {
  can_read_context: true,
  can_create_comments: true,
  can_change_status: true,
  can_complete_tasks: false,
  can_modify_settings: false,
  can_delete_tasks: false,
};

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const t = await getTranslations("settings");
  const access = await requireProjectAccess(projectId);

  let project: Project;
  let technologies: Technology[];
  let aiPermissions: AiPermissionsRow;

  // getDiscordIntegrationInfo() already branches on hasDirectDatabase()
  // internally and runs its own concurrent queries - started here so it
  // runs alongside the rest of this page's data instead of after it.
  const discordInfoPromise = getDiscordIntegrationInfo(projectId, access.userId);
  const labelPresetsPromise = getLabelPresets(access.userId, projectId);

  if (hasDirectDatabase()) {
    // Three withUser() calls, not one wrapping Promise.all([...]) - each
    // checks out its own pooled connection, so this is genuinely concurrent
    // instead of firing multiple queries on one pg client (the deprecated
    // shape, removed in pg@9).
    const [projectRes, techRes, permsRes] = await Promise.all([
      withUser(access.userId, ({ query }) => query("SELECT * FROM projects WHERE id = $1", [projectId])),
      withUser(access.userId, ({ query }) =>
        query(
          `SELECT * FROM technologies WHERE project_id = $1
           ORDER BY sort_order ASC NULLS LAST, name ASC`,
          [projectId]
        )
      ),
      withUser(access.userId, ({ query }) =>
        query(
          "SELECT can_read_context, can_create_comments, can_change_status, can_complete_tasks, can_modify_settings, can_delete_tasks FROM project_ai_permissions WHERE project_id = $1",
          [projectId]
        )
      ),
    ]);
    project = projectRes.rows[0];
    technologies = techRes.rows;
    aiPermissions = permsRes.rows[0] ?? DEFAULT_AI_PERMISSIONS;
  } else {
    const supabase = await createClient();
    const [projectRes, techRes, permsRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase
        .from("technologies")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
      supabase
        .from("project_ai_permissions")
        .select("can_read_context, can_create_comments, can_change_status, can_complete_tasks, can_modify_settings, can_delete_tasks")
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);

    project = projectRes.data as Project;
    technologies = (techRes.data ?? []) as Technology[];
    aiPermissions = (permsRes.data as AiPermissionsRow | null) ?? DEFAULT_AI_PERMISSIONS;
  }

  const [discordInfo, labelPresets, workflow] = await Promise.all([
    discordInfoPromise,
    labelPresetsPromise,
    getWorkflowOverrides(access.userId, projectId),
  ]);

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <nav aria-label={t("title")} className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary">
        <a href="#project-general" className="underline underline-offset-2">{t("general")}</a>
        <a href="#project-modules" className="underline underline-offset-2">{t("modulesTitle")}</a>
        <a href="#project-columns" className="underline underline-offset-2">{t("boardColumnsTitle")}</a>
        <a href="#project-export" className="underline underline-offset-2">{t("exportProjectTitle")}</a>
      </nav>
      <div id="project-general" className="scroll-mt-24"><SettingsForm
        project={project}
        initialTechnologies={technologies.map((t) => t.name)}
      /></div>
      <div id="project-modules" className="scroll-mt-24"><ModulesForm
        projectId={projectId}
        initialDisabled={project.disabled_modules ?? []}
        canManage={canManageProject(access.role)}
      /></div>
      <div id="project-columns" className="scroll-mt-24"><BoardColumnsForm projectId={projectId} overrides={workflow.columns} /></div>
      <FinishedTasksForm
        projectId={projectId}
        initialDays={project.done_cleanup_days ?? null}
        canManage={canManageProject(access.role)}
      />
      <PrioritiesForm projectId={projectId} overrides={workflow.priorities} />
      <LabelPresetsForm
        projectId={projectId}
        initialPresets={labelPresets}
        canManage={canManageProject(access.role)}
        aiEnabled={await showAi(access.userId, project.ai_enabled)}
      />
      {/* Hidden, not just disabled, when the project has AI switched off
          (migration 046) - the saved permissions are kept as-is and come
          back untouched if AI is turned on again. */}
      {project.ai_enabled && (
        <AiPermissionsForm
          projectId={projectId}
          permissions={aiPermissions}
          allowAutoComplete={project.allow_ai_auto_complete}
        />
      )}
      <DiscordIntegrationForm projectId={projectId} initialInfo={discordInfo} />
      {canWriteProject(access.role) && (
        <ReportWidgetCard projectId={projectId} siteUrl={SITE_URL} initialKeys={await listReportWidgetKeys(projectId)} />
      )}
      <div id="project-export" className="scroll-mt-24"><ExportProjectCard projectId={projectId} /></div>
      {access.role === "owner" && <DangerZoneCard projectId={projectId} />}
    </div>
  );
}
