import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { canManageProject, requireProjectAccess } from "@/lib/data/project-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { loadPublishSource, suggestVersion, type PublishSource } from "@/lib/data/module-registry";
import { reviewModuleSubmission } from "@/lib/work/module-review";
import { PublishForm } from "./publish-form";

/** Publish a builder draft or an installed module to the registry (migration 093). */
export default async function PublishModulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ source?: string; module?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const access = await requireProjectAccess(id);
  if (!canManageProject(access.role)) notFound();
  const source: PublishSource | null = query.source === "draft" ? { kind: "draft" }
    : query.source === "package" && typeof query.module === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(query.module) ? { kind: "package", moduleId: query.module } : null;
  if (!source) notFound();
  const [t, manifest, user] = await Promise.all([getTranslations("moduleRegistry"), loadPublishSource(access, source), getCurrentUser()]);
  const back = source.kind === "draft" ? `/projects/${id}/modules` : `/projects/${id}/modules/${source.moduleId}`;
  if (!manifest) return <section className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6"><h1 className="text-2xl font-semibold">{t("publishTitle")}</h1><p className="text-sm text-muted-foreground">{t("noManifest")}</p><Link href={back} className="text-sm text-primary underline">{t("back")}</Link></section>;
  const version = await suggestVersion(access.userId, manifest);
  const review = reviewModuleSubmission(manifest, { description: "", changelog: "" });
  return <section className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <Link href={back} className="text-sm text-primary underline">{t("back")}</Link>
    <header className="space-y-1"><h1 className="break-words text-2xl font-semibold">{t("publishTitle")}: {manifest.name}</h1><p className="text-sm text-muted-foreground">{t("publishHint")}</p></header>
    <section className="space-y-2 rounded-lg border bg-card p-4 text-sm">
      <p><span className="text-muted-foreground">{t("moduleId")}:</span> <code>{manifest.id}</code></p>
      <p><span className="text-muted-foreground">{t("permissions")}:</span> {manifest.permissions.join(", ") || "-"}</p>
      <p><span className="text-muted-foreground">{t("views")}:</span> {manifest.views.map((view) => `${view.name} (${view.type})`).join(", ") || "-"}</p>
      {review.warnings.length > 0 && <div role="note" className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3"><p className="font-medium">{t("warningsTitle")}</p><ul className="list-inside list-disc">{review.warnings.map((warning, index) => <li key={index} className="break-words">{t(`finding.${warning.code}`)} - <code>{warning.path}</code>{warning.excerpt ? `: ${warning.excerpt}` : ""}</li>)}</ul></div>}
    </section>
    <PublishForm projectId={id} source={source} defaults={{ version, author: user.full_name || "" }} back={back} />
  </section>;
}
