import { getTranslations } from "next-intl/server";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { CATALOG_COLUMNS, decodeCatalogRow, type CatalogEntry, type CatalogRow } from "@/lib/data/module-catalog";
import { reviewModuleSubmission } from "@/lib/work/module-review";
import { ModulePermissionList } from "@/lib/work/module-catalog";
import { ReportControls, ReviewControls } from "./review-controls";

type Report = { id: string; module_id: string; version: string; reason: "malicious" | "misleading" | "privacy" | "copyright" | "spam" | "other"; details: string; created_at: string };
type Event = { id: number; module_id: string; version: string | null; action: "submitted" | "published" | "approved" | "rejected" | "withdrawn" | "reported" | "report_resolved" | "signed"; note: string | null; created_at: string | Date };

/**
 * Module registry moderation (migration 093): public submissions waiting for
 * review, open abuse reports and the latest registry log. Service role -
 * admins see every version regardless of visibility.
 */
export default async function AdminModulesPage() {
  const admin = await requireAdminAccess();
  const t = await getTranslations("moduleRegistry");
  const runtime = await getTranslations("moduleRuntime");
  const db = serviceDataClient();
  const [pending, reports, events] = await Promise.all([
    db.from("module_catalog_entries").select<CatalogRow>(CATALOG_COLUMNS).eq("status", "pending_review").order("submitted_at", { ascending: true }).limit(50),
    db.from("module_reports").select<Report>("id, module_id, version, reason, details, created_at").eq("status", "open").order("created_at", { ascending: true }).limit(100),
    db.from("module_registry_events").select<Event>("id, module_id, version, action, note, created_at").order("id", { ascending: false }).limit(50),
  ]);
  if (pending.error || reports.error || events.error) throw new Error("Could not load the module registry. Apply migration 093 before deployment.");
  const queue = pending.data.flatMap((row) => { try { return [decodeCatalogRow(row)]; } catch { return []; } });
  const submitters = new Map<string, string>();
  const ids = [...new Set(queue.map((entry) => entry.submittedBy).filter((id): id is string => Boolean(id)))];
  if (ids.length) {
    const { data } = await db.from("profiles").select<{ id: string; email: string | null; full_name: string | null }>("id, email, full_name").in("id", ids);
    for (const profile of data ?? []) submitters.set(profile.id, profile.full_name || profile.email || profile.id);
  }
  const labels = { read: runtime("permissionRead"), write: runtime("permissionWrite"), none: runtime("permissionNone"), "tasks:write": runtime("permissionTasks"), "notifications:send": runtime("permissionNotify"), "webhooks:send": runtime("permissionWebhooks") };
  return <div className="container mx-auto max-w-5xl space-y-8 px-6 py-8">
    <div><h2 className="text-2xl font-bold">{t("adminTitle")}</h2><p className="text-muted-foreground">{t("adminDescription")}</p></div>
    <section className="space-y-4" aria-labelledby="review-queue">
      <h3 id="review-queue" className="text-lg font-semibold">{t("queueTitle", { count: queue.length })}</h3>
      {!queue.length && <p className="text-sm text-muted-foreground">{t("queueEmpty")}</p>}
      {queue.map((entry) => <Submission key={`${entry.moduleId}@${entry.version}`} entry={entry} submitter={entry.submittedBy ? submitters.get(entry.submittedBy) ?? "?" : "—"} own={entry.submittedBy === admin.id} labels={labels} t={t} />)}
    </section>
    <section className="space-y-3" aria-labelledby="open-reports">
      <h3 id="open-reports" className="text-lg font-semibold">{t("reportsTitle", { count: reports.data.length })}</h3>
      {!reports.data.length && <p className="text-sm text-muted-foreground">{t("reportsEmpty")}</p>}
      <ul className="space-y-3">{reports.data.map((report) => <li key={report.id} className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium"><a className="text-primary underline" href={`/marketplace/${encodeURIComponent(report.module_id)}/${encodeURIComponent(report.version)}`}>{report.module_id}@{report.version}</a> · {t(`reason.${report.reason}`)}</p>
        {report.details && <p className="whitespace-pre-wrap break-words">{report.details}</p>}
        <ReportControls reportId={report.id} moduleId={report.module_id} version={report.version} />
      </li>)}</ul>
    </section>
    <section className="space-y-2" aria-labelledby="registry-log">
      <h3 id="registry-log" className="text-lg font-semibold">{t("logTitle")}</h3>
      <ul className="space-y-1 text-sm">{events.data.map((event) => { const at = new Date(event.created_at).toISOString(); return <li key={event.id} className="break-words"><time dateTime={at} className="text-muted-foreground">{at.slice(0, 16).replace("T", " ")}</time> · {event.module_id}{event.version ? `@${event.version}` : ""} · {t(`action.${event.action}`)}{event.note ? ` — ${event.note}` : ""}</li>; })}</ul>
    </section>
  </div>;
}

function Submission({ entry, submitter, own, labels, t }: { entry: CatalogEntry; submitter: string; own: boolean; labels: { read: string; write: string; none: string }; t: Awaited<ReturnType<typeof getTranslations<"moduleRegistry">>> }) {
  const review = reviewModuleSubmission(entry.manifest, { description: entry.description, changelog: entry.changelog });
  return <article className="space-y-3 rounded-lg border bg-card p-4">
    <header><h4 className="break-words font-semibold">{entry.manifest.name} <span className="font-normal text-muted-foreground">{entry.moduleId}@{entry.version}</span></h4>
      <p className="text-xs text-muted-foreground">{submitter} · {entry.license} · {t(`categoryOption.${entry.category}`)} · {entry.submittedAt.slice(0, 10)}</p></header>
    <p className="whitespace-pre-wrap break-words text-sm">{entry.description}</p>
    {entry.changelog && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.changelog}</p>}
    <ModulePermissionList permissions={entry.manifest.permissions} labels={labels} />
    <ul className="list-inside list-disc text-sm">{entry.manifest.views.map((view) => <li key={view.id} className="break-words">{view.name} ({view.type})</li>)}</ul>
    {review.blocking.length + review.warnings.length > 0 && <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"><p className="font-medium">{t("warningsTitle")}</p>
      <ul className="list-inside list-disc">{[...review.blocking, ...review.warnings].map((finding, index) => <li key={index} className="break-words">{t(`finding.${finding.code}`)} — <code>{finding.path}</code>{finding.excerpt ? `: ${finding.excerpt}` : ""}</li>)}</ul></div>}
    <details className="text-sm"><summary className="cursor-pointer">{t("manifestJson")}</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{JSON.stringify(entry.manifest, null, 2)}</pre></details>
    <ReviewControls moduleId={entry.moduleId} version={entry.version} ownSubmission={own} />
  </article>;
}
