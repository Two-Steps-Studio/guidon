import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { getCatalogEntry, isInstallable } from "@/lib/data/module-catalog";
import { ModuleView } from "@/lib/work/module-view";
import { ModulePage } from "@/lib/work/module-page";
import { ReportModuleForm } from "./report-form";
import { ModulePermissionList } from "@/lib/work/module-catalog";

export default async function ModuleDetailsPage({ params }: { params: Promise<{ moduleId: string; version: string }> }) {
  const user = await getCurrentUser();
  const { moduleId, version } = await params;
  const entry = await getCatalogEntry(user.id, moduleId, version);
  if (!entry) notFound();
  const [t, runtime, registry] = await Promise.all([getTranslations("moduleCatalog"), getTranslations("moduleRuntime"), getTranslations("moduleRegistry")]);
  const installable = isInstallable(entry) && entry.compatible;
  return <AppShell user={user}><main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/marketplace" className="text-sm text-primary underline">{t("title")}</Link>
    <header className="space-y-2"><h1 className="break-words text-3xl font-semibold">{entry.name}</h1><p className="text-muted-foreground">{entry.author} · v{entry.version}</p><p className="break-words">{entry.description}</p><p className="text-sm">{entry.compatible ? t("compatible") : t("incompatible")}</p>
      <p className="flex flex-wrap gap-2 text-xs"><span className="rounded bg-muted px-2 py-1">{registry(`visibilityOption.${entry.visibility}`)}</span><span className="rounded bg-muted px-2 py-1">{registry("licenseLabel", { license: entry.license })}</span><span className={`rounded px-2 py-1 ${entry.signature === "invalid" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{registry(`signature.${entry.signature}`)}</span></p>
      {entry.status !== "published" && <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">{registry(`statusNotice.${entry.status}`)}{entry.reviewNote ? ` — ${entry.reviewNote}` : ""}</p>}</header>
    <section className="space-y-3 rounded-lg border bg-card p-5"><h2 className="text-lg font-semibold">{runtime("permissions")}</h2>
      <ModulePermissionList permissions={entry.manifest.permissions} labels={{ read: runtime("permissionRead"), write: runtime("permissionWrite"), none: runtime("permissionNone"), "tasks:write": runtime("permissionTasks"), "notifications:send": runtime("permissionNotify"), "webhooks:send": runtime("permissionWebhooks"), "code:run": runtime("permissionCode") }} />
      <p className="break-words text-sm text-muted-foreground">{t("engine")}: ≥ {entry.manifest.engine.minVersion}{entry.manifest.engine.maxVersionExclusive ? `, < ${entry.manifest.engine.maxVersionExclusive}` : ""}</p>
    </section>
    {entry.screenshots.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">{t("screenshots")}</h2>{entry.screenshots.map((src) => <Image key={src} src={src} alt={entry.name} width={1200} height={720} className="h-auto w-full rounded-lg border" />)}</section>}
    <section className="space-y-2 rounded-lg border bg-card p-5"><h2 className="text-lg font-semibold">{t("changelog")}</h2><p className="whitespace-pre-wrap break-words text-sm">{entry.changelog || t("noChangelog")}</p></section>
    <section className="space-y-3 rounded-lg border bg-card p-5"><h2 className="text-lg font-semibold">{t("preview")}</h2><p className="text-sm text-muted-foreground">{t("previewHint")}</p>
      {entry.manifest.views.filter((view) => view.type !== "form").map((view) => <details key={view.id} className="min-w-0 rounded-md border p-3"><summary className="cursor-pointer font-medium">{view.name}</summary><div className="mt-4 min-w-0">{view.type === "page" ? <ModulePage view={view} records={entry.demoRecords} labels={{ empty: runtime("empty"), edit: runtime("edit"), remove: runtime("remove") }} /> : <ModuleView manifest={entry.manifest} view={view} records={entry.demoRecords} labels={{ empty: runtime("empty"), yes: runtime("yes"), no: runtime("no"), ungrouped: runtime("ungrouped"), unscheduled: runtime("unscheduled"), edit: runtime("edit"), remove: runtime("remove"), actions: runtime("actions"), count: runtime("count") }} />}</div></details>)}
    </section>
    <section className="space-y-3 rounded-lg border bg-card p-5"><h2 className="text-lg font-semibold">{t("documentation")}</h2>{entry.manifest.entities.map((entity) => <div key={entity.id} className="space-y-1"><h3 className="font-medium">{entity.name}</h3><ul className="list-inside list-disc break-words text-sm">{entity.fields.map((field) => <li key={field.id}>{field.name} — {field.type}{field.required ? " *" : ""}</li>)}</ul></div>)}</section>
    <div className="flex flex-wrap items-start gap-4">{installable && <Link href={`/marketplace/${encodeURIComponent(entry.moduleId)}/${encodeURIComponent(entry.version)}/install`} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">{t("chooseProject")}</Link>}{entry.status === "published" && <ReportModuleForm moduleId={entry.moduleId} version={entry.version} />}</div>
    <p className="text-xs text-muted-foreground">{entry.moduleId}@{entry.version}</p>
  </main></AppShell>;
}
