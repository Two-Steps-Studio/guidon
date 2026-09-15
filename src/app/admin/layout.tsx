import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: "Admin - Guidon" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminAccess();
  const t = await getTranslations("admin");

  return (
    <AppShell user={user}>
      <div className="border-b border-border bg-background-secondary px-6 py-4">
        <p className="text-sm text-muted-foreground">
          {t("signedInAs", { email: user.email ?? user.id })}
        </p>
      </div>
      {children}
    </AppShell>
  );
}
