import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getManagedModule } from "@/lib/data/module-manager";
import { getCatalogVersions } from "@/lib/data/module-catalog";
import { compareSemver } from "@/lib/work/module-manifest";
import { ModulePermissionList } from "@/lib/work/module-catalog";
import { manageModule } from "./actions";

export default async function ModuleManagerPage({ params, searchParams }: {
  params: Promise<{ id: string; moduleId: string }>;
  searchParams: Promise<{ version?: string; error?: string; saved?: string }>;
}) {
  const { id, moduleId } = await params;
  const context = await getManagedModule(id, moduleId);
  if (!context) notFound();
  const [query, t, runtime, entries] = await Promise.all([searchParams, getTranslations("moduleManager"), getTranslations("moduleRuntime"), getCatalogVersions(context.access.userId, moduleId)]);
  const { current } = context;
  const action = manageModule.bind(null, id, moduleId);
  const path = `/projects/${id}/modules/${moduleId}`;
  const versions = entries.filter((entry) => entry.version !== current.manifest.version && (!entry.organizationId || entry.organizationId === context.access.project.organization_id));
  const candidate = versions.find((entry) => entry.version === query.version);
  const added = candidate?.manifest.permissions.filter((permission) => !current.manifest.permissions.includes(permission)) ?? [];
  const removed = candidate ? current.manifest.permissions.filter((permission) => !candidate.manifest.permissions.includes(permission)) : [];
  const errors = ["permission", "unsupported", "consent", "conflict", "invalid", "incompatibleData", "saveFailed"] as const;
  const error = errors.find((value) => value === query.error);
  const button = "rounded-md border px-4 py-2 text-sm";
  const hidden = <input type="hidden" name="revision" value={current.revision} />;
  return <section className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
    <Link href={`/projects/${id}/modules#module-${moduleId}`} className="text-sm text-primary underline">{runtime("title")}</Link>
    <header><h1 className="break-words text-2xl font-semibold">{current.manifest.name}</h1><p className="text-sm text-muted-foreground">v{current.manifest.version} · {current.installed ? current.enabled ? t("enabled") : t("disabled") : t("uninstalled")}</p></header>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}{query.saved && <p role="status">{t("saved")}</p>}
    <section className="space-y-3 rounded-lg border bg-card p-5"><h2 className="font-semibold">{t("data")}</h2><p className="text-sm">{t("retainHint")}</p><a href={`${path}/export`} className="inline-block text-sm text-primary underline">{t("export")}</a></section>
    <section className="space-y-4 rounded-lg border bg-card p-5"><h2 className="font-semibold">{t("configuration")}</h2>
      <form action={action} className="space-y-3">{hidden}<input type="hidden" name="command" value="settings" /><label htmlFor="default-view" className="block text-sm">{t("defaultView")}</label><select id="default-view" name="defaultView" defaultValue={current.settings.defaultView ?? ""} className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">{t("automatic")}</option>{current.manifest.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select><label htmlFor="module-category" className="block text-sm">{t("category")}</label><input id="module-category" name="category" defaultValue={current.settings.category ?? ""} maxLength={40} placeholder={t("categoryPlaceholder")} aria-describedby="module-category-hint" className="w-full rounded-md border bg-background px-3 py-2 text-sm" /><p id="module-category-hint" className="text-xs text-muted-foreground">{t("categoryHint")}</p><button className={button}>{t("saveSettings")}</button></form>
      {current.installed ? <div className="flex flex-wrap gap-3"><form action={action}>{hidden}<input type="hidden" name="command" value={current.enabled ? "disable" : "enable"} /><button className={button}>{current.enabled ? t("disable") : t("enable")}</button></form><form action={action}>{hidden}<input type="hidden" name="command" value="uninstall" /><button className={`${button} text-destructive`}>{t("uninstall")}</button></form></div>
        : <form action={action} className="space-y-3">{hidden}<input type="hidden" name="command" value="restore" /><input type="hidden" name="digest" value={context.digest} />{current.manifest.permissions.map((permission) => <input key={permission} type="hidden" name="permissions" value={permission} />)}<ModulePermissionList permissions={current.manifest.permissions} labels={{ read: runtime("permissionRead"), write: runtime("permissionWrite"), none: runtime("permissionNone") }} /><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="approve" required /><span>{runtime("consentLabel")}</span></label><button className={button}>{t("restore")}</button></form>}
    </section>
    {current.installed && <section className="space-y-4 rounded-lg border bg-card p-5"><h2 className="font-semibold">{t("versions")}</h2><p className="text-sm text-muted-foreground">{t("compatibilityHint")}</p>
      {!versions.length ? <p className="text-sm">{t("noVersions")}</p> : <form action={path} method="get" className="space-y-3"><label htmlFor="target-version" className="block text-sm">{t("chooseVersion")}</label><select id="target-version" name="version" defaultValue={candidate?.version ?? ""} required className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">{t("chooseVersion")}</option>{versions.map((entry) => <option key={entry.version} value={entry.version} disabled={!entry.compatible}>{entry.version}</option>)}</select><button className={button}>{t("review")}</button></form>}
      {candidate && <form action={action} className="space-y-3 rounded-md border p-4">{hidden}<input type="hidden" name="command" value="replace" /><input type="hidden" name="targetVersion" value={candidate.version} /><input type="hidden" name="digest" value={candidate.digest} />{candidate.manifest.permissions.map((permission) => <input key={permission} type="hidden" name="permissions" value={permission} />)}
        <h3 className="font-medium">{current.manifest.version} → {candidate.version}</h3><p className="whitespace-pre-wrap text-sm">{candidate.changelog}</p><p className="text-sm">{t("addedScopes")}: {added.join(", ") || "—"}</p><p className="text-sm">{t("removedScopes")}: {removed.join(", ") || "—"}</p>
        <ModulePermissionList permissions={candidate.manifest.permissions} labels={{ read: runtime("permissionRead"), write: runtime("permissionWrite"), none: runtime("permissionNone") }} />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="approve" required /><span>{runtime("consentLabel")}</span></label><button disabled={!candidate.compatible} className={`${button} bg-primary text-primary-foreground`}>{compareSemver(candidate.version, current.manifest.version) < 0 ? t("rollback") : t("update")}</button>
      </form>}
    </section>}
  </section>;
}
