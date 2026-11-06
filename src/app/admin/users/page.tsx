import { getTranslations } from "next-intl/server";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listUsersForAdmin } from "@/lib/data/admin";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { UserDirectory } from "./user-directory";

export default async function AdminUsersPage() {
  const { role } = await requireAdminAccess("users.read");
  const [t, { data, error }] = await Promise.all([getTranslations("admin"), listUsersForAdmin(null)]);
  if (error) throw new Error("Could not load the admin user directory");

  return <div className="container mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6">
    <h2 className="text-2xl font-bold">{t("users")}</h2>
    <UserDirectory initial={data} canSearch={hasAdminPermission(role, "users.directory.search")}
      canReveal={hasAdminPermission(role, "users.pii.reveal")} />
  </div>;
}
