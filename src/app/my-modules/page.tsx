import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { moduleManifestSchema } from "@/lib/work/module-manifest";
import { getAuthorModules } from "@/lib/data/module-registry";
import { WithdrawVersionButton } from "./withdraw-button";

export default async function MyModulesPage() {
  const user = await getCurrentUser();
  const [t, registry] = await Promise.all([getTranslations("moduleCatalog"), getTranslations("moduleRegistry")]);
  const published = await getAuthorModules(user.id);
  const db = dataClient(user.id);
  const installed = await db.from("project_module_packages").select<{ project_id: string; module_id: string; manifest: unknown; enabled: boolean; installed: boolean }>("project_id, module_id, manifest, enabled, installed").order("module_id").limit(200);
  if (installed.error) throw new Error("Could not load installed modules. Apply migrations 080 and 082 before deployment.");
  const ids = [...new Set(installed.data.map((row) => row.project_id))];
  const projects = ids.length ? await db.from("projects").select<{ id: string; name: string }>("id, name").in("id", ids) : { data: [], error: null };
  if (projects.error) throw new Error("Could not load module projects");
  const byId = new Map(projects.data.map((project) => [project.id, project.name]));
  return <AppShell user={user}><section className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap justify-between gap-4"><h1 className="text-2xl font-semibold">{t("myModules")}</h1><Link href="/marketplace" className="text-primary underline">{t("title")}</Link></div>
    {!installed.data.length && <p className="text-muted-foreground">{t("emptyInstalled")}</p>}
    <div className="grid gap-4 md:grid-cols-2">{installed.data.map((row) => {
      // An unreadable manifest is skipped rather than failing the whole page.
      const parsed = moduleManifestSchema.safeParse(row.manifest);
      if (!parsed.success) return null;
      const manifest = parsed.data;
      return <article key={`${row.project_id}-${row.module_id}`} className="min-w-0 space-y-2 rounded-lg border bg-card p-5"><h2 className="break-words text-lg font-semibold">{manifest.name}</h2><p className="text-sm text-muted-foreground">v{manifest.version} · {byId.get(row.project_id)}</p><p className="text-sm">{!row.installed ? t("uninstalled") : row.enabled ? t("enabled") : t("disabled")}</p><Link href={`/projects/${row.project_id}/modules#module-${row.module_id}`} className="text-sm text-primary underline">{t("openProject")}</Link></article>;
    })}</div>
    <section id="published" className="scroll-mt-20 space-y-3" aria-labelledby="published-title">
      <div><h2 id="published-title" className="text-xl font-semibold">{registry("dashboardTitle")}</h2><p className="text-sm text-muted-foreground">{registry("dashboardHint")}</p></div>
      {!published.length ? <p className="text-sm text-muted-foreground">{registry("dashboardEmpty")}</p> : <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">{registry("dashboardTitle")}</caption>
        <thead><tr className="border-b text-muted-foreground [&>th]:p-2 [&>th]:font-medium"><th scope="col">{registry("colModule")}</th><th scope="col">{registry("version")}</th><th scope="col">{registry("visibility")}</th><th scope="col">{registry("colStatus")}</th><th scope="col">{registry("colInstalls")}</th><th scope="col">{registry("colReports")}</th><th scope="col">{registry("colChannel")}</th><th scope="col"><span className="sr-only">{registry("colActions")}</span></th></tr></thead>
        <tbody>{published.map(({ entry, installs, openReports }) => <tr key={`${entry.moduleId}@${entry.version}`} className="border-b align-top last:border-0 [&>td]:p-2">
          <td className="min-w-40 break-words"><Link href={`/marketplace/${encodeURIComponent(entry.moduleId)}/${encodeURIComponent(entry.version)}`} className="font-medium text-primary underline">{entry.name}</Link><span className="block text-xs text-muted-foreground">{entry.moduleId}</span></td>
          <td className="tabular-nums">{entry.version}<span className="block text-xs text-muted-foreground">{registry("engineRange", { min: entry.manifest.engine.minVersion })}</span></td>
          <td>{registry(`visibilityOption.${entry.visibility}`)}</td>
          <td>{registry(`status.${entry.status}`)}{entry.reviewNote && <span className="block max-w-64 whitespace-pre-wrap break-words text-xs text-muted-foreground">{entry.reviewNote}</span>}</td>
          <td className="tabular-nums">{installs}</td>
          <td className="tabular-nums">{openReports}</td>
          <td>{registry(entry.version.includes("-") ? "channelPrerelease" : "channelStable")}</td>
          <td>{entry.status !== "withdrawn" && entry.status !== "rejected" && <WithdrawVersionButton moduleId={entry.moduleId} version={entry.version} />}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </section></AppShell>;
}
