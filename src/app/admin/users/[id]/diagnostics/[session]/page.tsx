import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AUDIT_UUID } from "@/lib/admin/audit";
import type { DiagnosticReason } from "@/lib/admin/diagnostic-reasons";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { DiagnosticsSession } from "../../../diagnostics-controls";

export default async function UserDiagnosticsPage({ params }: {
  params: Promise<{ id: string; session: string }>;
}) {
  const actor = await requireAdminAccess("users.diagnostics.start");
  const { id, session } = await params;
  if (!AUDIT_UUID.test(id) || !AUDIT_UUID.test(session)) notFound();

  const db = serviceDataClient();
  const view = await db.from<{ reason: DiagnosticReason; expires_at: string }>("platform_admin_diagnostics")
    .select("reason, expires_at").eq("id", session).eq("actor_id", actor.id).eq("target_id", id)
    .is("ended_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (view.error) throw new Error("Could not load diagnostic session");
  if (!view.data) notFound();

  const [t, format, organizations, activity] = await Promise.all([
    getTranslations("admin.diagnostics"), getFormatter(),
    db.from("organization_members").eq("user_id", id).count(),
    db.from<{ id: string; action: string; created_at: string }>("activity_logs").select("id, action, created_at")
      .eq("user_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (organizations.error || activity.error) throw new Error("Could not load diagnostic summary");

  const expiry = new Date(view.data.expires_at);
  return <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6">
    <h2 className="text-2xl font-bold">{t("title")}</h2>
    <DiagnosticsSession targetId={id} sessionId={session} expiresAt={expiry.toISOString()}>
      <dl className="space-y-2 rounded-xl border p-4">
        <dt>{t("account")}</dt><dd className="break-all font-mono">{id}</dd>
        <dt>{t("reason")}</dt><dd>{t(view.data.reason)}</dd>
        <dt>{t("expires")}</dt><dd>{format.dateTime(expiry, { timeStyle: "short", timeZone: "UTC" })} UTC</dd>
        <dt>{t("organizations")}</dt><dd>{organizations.data}</dd>
      </dl>
      <h3 className="font-semibold">{t("activity")}</h3>
      {activity.data.length ? <ul className="space-y-2">
        {activity.data.map(item => <li key={item.id} className="break-all">
          {item.action} · {format.dateTime(new Date(item.created_at), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
        </li>)}
      </ul> : <p>{t("empty")}</p>}
    </DiagnosticsSession>
  </div>;
}
