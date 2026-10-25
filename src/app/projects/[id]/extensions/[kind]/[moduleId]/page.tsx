import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireProjectAccess, canManageProject } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { getModulePackages } from "@/lib/data/module-packages";
import { customModulesSchema } from "@/lib/work/custom-modules";
import { CustomModules } from "../../../modules/custom-modules";
import { PackagePanel } from "../../../modules/declarative-modules";

export default async function ProjectExtensionPage({ params }: { params: Promise<{ id: string; kind: string; moduleId: string }> }) {
  const { id, kind, moduleId } = await params;
  if (!["content", "package"].includes(kind) || !/^[a-z][a-z0-9-]{0,63}$/.test(moduleId)) notFound();
  const access = await requireProjectAccess(id);
  const t = await getTranslations("nav");
  const canManage = canManageProject(access.role);
  let name: string;
  let content: React.ReactNode;
  if (kind === "package") {
    const extension = (await getModulePackages(access.userId, id)).find(item => item.moduleId === moduleId && item.installed && item.enabled && item.manifest.permissions.includes("module-data:read"));
    if (!extension) notFound();
    name = extension.manifest.name;
    content = <PackagePanel key={`${moduleId}-${extension.manifest.version}-${extension.settings.defaultView ?? ""}`} projectId={id} initial={extension} canManage={canManage} />;
  } else {
    const row = await dataClient(access.userId).from("projects").select<{ custom_modules: unknown; custom_modules_revision: number }>("custom_modules, custom_modules_revision").eq("id", id).single();
    if (row.error || !row.data) throw new Error("Could not load module");
    const modules = customModulesSchema.parse(row.data.custom_modules);
    const extension = modules.find(item => item.id === moduleId);
    if (!extension) notFound();
    name = extension.title;
    content = <CustomModules key={moduleId} projectId={id} initial={modules} initialRevision={row.data.custom_modules_revision} canManage={canManage} selectedId={moduleId} />;
  }
  return <section className="min-w-0 flex-1 space-y-4 p-4 sm:p-6"><header className="space-y-2"><h1 className="break-words text-2xl font-semibold">{name}</h1><Link href={`/projects/${id}/modules`} className="text-sm text-primary underline">{t("customModules")}</Link></header>{content}</section>;
}
