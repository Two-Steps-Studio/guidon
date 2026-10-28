import { getTranslations } from "next-intl/server";
import { showAi } from "@/lib/data/ai-preference";
import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { getModulePackages } from "@/lib/data/module-packages";
import { DeclarativeModules } from "./declarative-modules";
import { ModuleBuilder } from "./module-builder";
import { getModuleDraft } from "@/lib/data/module-drafts";

export default async function ModulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  const t = await getTranslations("customModules");
  const packages = await getModulePackages(access.userId, id);
  const draft = canManageProject(access.role) ? await getModuleDraft(access) : null;
  return <section className="flex-1 space-y-6 p-4 sm:p-6">
    <div><h1 className="text-2xl font-semibold">{t("title")}</h1><p className="text-sm text-muted-foreground">{t("description")}</p></div>
    <DeclarativeModules projectId={id} packages={packages} canManage={canManageProject(access.role)} />
    {draft && <ModuleBuilder key={`${id}-${access.userId}`} projectId={id} aiEnabled={await showAi(access.userId, access.project.ai_enabled)} initialDraft={draft} />}
  </section>;
}
