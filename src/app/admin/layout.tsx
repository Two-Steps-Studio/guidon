import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { AppShell } from "@/components/layout/app-shell";
import { adminPagesForRole } from "@/lib/admin/permissions";
import { endAdminSession } from "@/app/auth/admin/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminAccess("overview.read");
  const t = await getTranslations("admin");
  const tSession = await getTranslations("auth.admin");

  return (
    <AppShell user={user} adminPages={adminPagesForRole(user.role)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background-secondary px-6 py-4">
        <p className="text-sm text-muted-foreground">
          {t("signedInAs", { email: user.email ?? user.id })}
        </p>
        {process.env.PLATFORM_ADMIN_ACCESS === "sso" && <form action={endAdminSession}>
          <Button type="submit" size="sm" variant="outline">{tSession("end")}</Button>
        </form>}
      </div>
      {children}
    </AppShell>
  );
}
