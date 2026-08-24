import type { Metadata } from "next";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = { title: "Admin — Guidon" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminAccess();

  return (
    <AppShell user={user}>
      <div className="border-b border-border bg-background-secondary px-6 py-4">
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email ?? user.id} — instance-wide view, bypasses per-organization access.
        </p>
      </div>
      {children}
    </AppShell>
  );
}
