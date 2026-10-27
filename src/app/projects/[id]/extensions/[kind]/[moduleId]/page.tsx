import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireProjectAccess, canManageProject } from "@/lib/data/project-access";
import { getModulePackages } from "@/lib/data/module-packages";
import { PackagePanel } from "../../../modules/declarative-modules";

/** A module's own tab. "content" links predate migration 092, which made content modules packages under the same id. */
export default async function ProjectExtensionPage({ params }: { params: Promise<{ id: string; kind: string; moduleId: string }> }) {
  const { id, kind, moduleId } = await params;
  if (!["content", "package"].includes(kind) || !/^[a-z][a-z0-9-]{0,63}$/.test(moduleId)) notFound();
  if (kind === "content") permanentRedirect(`/projects/${id}/extensions/package/${moduleId}`);
  const access = await requireProjectAccess(id);
  const t = await getTranslations("nav");
  const extension = (await getModulePackages(access.userId, id)).find(item => item.moduleId === moduleId && item.installed && item.enabled && item.manifest.permissions.includes("module-data:read"));
  if (!extension) notFound();
  return <section className="min-w-0 flex-1 space-y-4 p-4 sm:p-6">
    <header className="space-y-2"><h1 className="break-words text-2xl font-semibold">{extension.manifest.name}</h1>{extension.manifest.description && <p className="break-words text-sm text-muted-foreground">{extension.manifest.description}</p>}<Link href={`/projects/${id}/modules`} className="text-sm text-primary underline">{t("customModules")}</Link></header>
    <PackagePanel key={`${moduleId}-${extension.manifest.version}-${extension.settings.defaultView ?? ""}`} projectId={id} initial={extension} canManage={canManageProject(access.role)} />
  </section>;
}
