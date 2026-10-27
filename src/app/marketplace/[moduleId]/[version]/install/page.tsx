import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { getCatalogEntry, isInstallable } from "@/lib/data/module-catalog";
import { dataClient } from "@/lib/data-client";
import { ModulePermissionList } from "@/lib/work/module-catalog";
import { ModuleInstallFields } from "@/lib/work/module-install-fields";
import { installFromCatalog } from "./actions";

export default async function ModuleInstallPage({ params, searchParams }: {
  params: Promise<{ moduleId: string; version: string }>;
  searchParams: Promise<{ organization?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  const { moduleId, version } = await params;
  const [entry, query, t, runtime] = await Promise.all([getCatalogEntry(user.id, moduleId, version), searchParams, getTranslations("moduleInstaller"), getTranslations("moduleRuntime")]);
  if (!entry) notFound();
  const db = dataClient(user.id);
  const memberships = await db.from("project_members").select<{ project_id: string }>("project_id").eq("user_id", user.id).in("role", ["owner", "admin"]).limit(200);
  if (memberships.error) throw new Error("Could not load project permissions");
  const ids = memberships.data.map((membership) => membership.project_id);
  const projects = ids.length ? await db.from("projects").select<{ id: string; name: string; organization_id: string }>("id, name, organization_id").in("id", ids).order("name") : { data: [], error: null };
  if (projects.error) throw new Error("Could not load installation projects");
  const eligible = projects.data.filter((project) => !entry.organizationId || project.organization_id === entry.organizationId);
  const organizationIds = [...new Set(eligible.map((project) => project.organization_id))];
  const organizations = organizationIds.length ? await db.from("organizations").select<{ id: string; name: string }>("id, name").in("id", organizationIds).order("name") : { data: [], error: null };
  if (organizations.error) throw new Error("Could not load installation organizations");
  const selected = organizations.data.some((organization) => organization.id === query.organization) ? query.organization : organizations.data.length === 1 ? organizations.data[0].id : "";
  const path = `/marketplace/${encodeURIComponent(moduleId)}/${encodeURIComponent(version)}`;
  const errors = ["permission", "unsupported", "consent", "conflict", "limit", "saveFailed"] as const;
  const error = errors.find((value) => value === query.error);
  return <AppShell user={user}><main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <Link href={path} className="text-sm text-primary underline">{entry.name}</Link><h1 className="text-2xl font-semibold">{t("title")}</h1><p>{entry.name} · v{entry.version}</p>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    <section className="space-y-3 rounded-lg border bg-card p-5"><h2 className="font-semibold">{runtime("permissions")}</h2><ModulePermissionList permissions={entry.manifest.permissions} labels={{ read: runtime("permissionRead"), write: runtime("permissionWrite"), none: runtime("permissionNone") }} /><p className="text-sm text-muted-foreground">{t("emptyData")}</p></section>
    {!entry.compatible || !isInstallable(entry) ? <p role="alert">{runtime("unsupported")}</p> : !eligible.length ? <p className="text-muted-foreground">{t("noProjects")}</p> : <>
      <form action={`${path}/install`} method="get" className="space-y-3 rounded-lg border bg-card p-5"><label htmlFor="install-org" className="block text-sm font-medium">{t("organization")}</label><select id="install-org" name="organization" defaultValue={selected} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">{t("chooseOrganization")}</option>{organizations.data.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><button type="submit" className="rounded-md border px-4 py-2 text-sm">{t("continue")}</button></form>
      {selected && <form action={installFromCatalog.bind(null, moduleId, version)} className="rounded-lg border bg-card p-5"><ModuleInstallFields projects={eligible.filter((project) => project.organization_id === selected)} permissions={entry.manifest.permissions} digest={entry.digest} labels={{ project: t("project"), chooseProject: t("chooseProject"), consent: runtime("consentLabel"), install: runtime("install") }} /></form>}
    </>}
  </main></AppShell>;
}
