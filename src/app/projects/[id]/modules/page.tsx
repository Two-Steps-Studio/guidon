import { getTranslations } from "next-intl/server";
import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { customModulesSchema } from "@/lib/work/custom-modules";
import { CustomModules } from "./custom-modules";
import { getModulePackages } from "@/lib/data/module-packages";
import { DeclarativeModules } from "./declarative-modules";
import { ModuleBuilder } from "./module-builder";
import { getModuleDraft } from "@/lib/data/module-drafts";

export default async function ModulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  const t = await getTranslations("customModules");
  const { data, error } = await dataClient(access.userId).from("projects")
    .select<{ custom_modules: unknown; custom_modules_revision: number }>("custom_modules, custom_modules_revision")
    .eq("id", id).single();
  if (error || !data) throw new Error("Could not load project modules. Apply migration 079 before deployment.");
  const parsed = customModulesSchema.safeParse(data.custom_modules);
  if (!parsed.success) throw new Error("Invalid stored project modules");
  const packages = await getModulePackages(access.userId, id);
  const draft = canManageProject(access.role) ? await getModuleDraft(access) : null;
  return <main className="flex-1 space-y-6 p-4 sm:p-6">
    <div><h1 className="text-2xl font-semibold">{t("title")}</h1><p className="text-sm text-muted-foreground">{t("description")}</p></div>
    {draft && <ModuleBuilder key={`${id}-${access.userId}`} projectId={id} aiEnabled={access.project.ai_enabled} initialDraft={draft} />}
    <CustomModules projectId={id} initial={parsed.data} initialRevision={data.custom_modules_revision} canManage={canManageProject(access.role)} />
    <DeclarativeModules projectId={id} packages={packages} canManage={canManageProject(access.role)} />
  </main>;
}
