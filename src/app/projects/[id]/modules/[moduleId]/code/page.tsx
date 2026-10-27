import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getManagedModule } from "@/lib/data/module-manager";
import { dataClient } from "@/lib/data-client";
import { MODULE_SCRIPT_TEMPLATE } from "@/lib/work/module-sdk";
import { CodePanel } from "./code-panel";

/** The module's script editor (engine 1.3) - project owners/admins of a module made in this project. */
export default async function ModuleCodePage({ params }: { params: Promise<{ id: string; moduleId: string }> }) {
  const { id, moduleId } = await params;
  const context = await getManagedModule(id, moduleId);
  if (!context) notFound();
  const t = await getTranslations("moduleSandbox");
  const origin = await dataClient(context.access.userId).from<{ catalog_version: string | null }>("project_module_packages").select("catalog_version").eq("project_id", id).eq("module_id", moduleId).maybeSingle();
  const fromCatalog = Boolean(origin.data?.catalog_version);
  const { current } = context;
  return <section className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
    <Link href={`/projects/${id}/modules/${moduleId}`} className="text-sm text-primary underline">{t("back")}</Link>
    <header className="space-y-1"><h1 className="break-words text-2xl font-semibold">{t("title", { name: current.manifest.name })}</h1><p className="text-sm text-muted-foreground">{t("hint")}</p></header>
    {fromCatalog ? <p role="note" className="rounded-md border p-3 text-sm">{t("catalogReadOnly")}</p> : null}
    <CodePanel projectId={id} moduleId={moduleId} manifest={current.manifest} records={current.records} revision={current.revision}
      initialSource={current.manifest.script?.source ?? MODULE_SCRIPT_TEMPLATE} readOnly={fromCatalog} needsConsent={!current.manifest.permissions.includes("code:run")} />
  </section>;
}
