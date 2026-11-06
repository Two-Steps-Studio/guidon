import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { AUDIT_UUID } from "@/lib/admin/audit";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { listUsersForAdmin } from "@/lib/data/admin";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { ProfileDisclosure } from "../profile-disclosure";
import { AdminAccountOperations } from "../account-operations";
import { hasDirectDatabase } from "@/lib/db/pool";
import { isEmailConfigured } from "@/lib/email/resend";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminAccess("users.read");
  const { role } = admin;
  const { id } = await params;
  if (!AUDIT_UUID.test(id)) notFound();
  const { data, error } = await listUsersForAdmin(null, id);
  if (error) throw new Error("Could not load the admin profile");
  const user = data[0];
  if (!user) notFound();
  const [t, format, memberships] = await Promise.all([
    getTranslations("admin"), getFormatter(),
    serviceDataClient().from<{ organization_id: string; role: string }>("organization_members")
      .select("organization_id, role").eq("user_id", user.id).order("organization_id").limit(51),
  ]);
  if (memberships.error) throw new Error("Could not load organization memberships");
  const canRecover = hasAdminPermission(role, "users.password.recovery") && isEmailConfigured();
  const canBlock = admin.id !== user.id && hasAdminPermission(role, "users.signin.block");
  const canUnblock = admin.id !== user.id && hasAdminPermission(role, "users.signin.unblock");

  return <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6">
    <Link href="/admin/users" className="underline">{t("users")}</Link>
    <h2 className="text-2xl font-bold">{t("directory.detail")}</h2>
    <dl className="space-y-2 rounded-xl border p-4">
      <dt>{t("pii.userId")}</dt><dd className="break-all font-mono">{user.id}</dd>
      <dt>{t("colCreated")}</dt><dd>{user.created_at ? format.dateTime(new Date(user.created_at), { dateStyle: "medium", timeZone: "UTC" }) : "—"}</dd>
      <dt>{t("pii.profile")}</dt><dd>{hasAdminPermission(role, "users.pii.reveal") ? <ProfileDisclosure userId={user.id} /> : t("pii.hidden")}</dd>
    </dl>
    {hasAdminPermission(role, "audit.read") && <Link className="underline" href={`/admin/audit?type=user&target=${user.id}`}>{t("audit.title")}</Link>}
    <h3 className="text-lg font-semibold">{t("directory.memberships")}</h3>
    {memberships.data.length ? <ul className="space-y-2">
      {memberships.data.slice(0, 50).map(member => <li key={member.organization_id} className="break-all">{member.organization_id} · {member.role}</li>)}
    </ul> : <p>—</p>}
    {memberships.data.length > 50 && <p>{t("directory.membershipLimit")}</p>}
    {!hasDirectDatabase() && (canRecover || canBlock || canUnblock) &&
      <AdminAccountOperations userId={user.id} canRecover={canRecover} canBlock={canBlock} canUnblock={canUnblock} />}
  </div>;
}
