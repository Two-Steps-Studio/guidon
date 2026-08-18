import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireAdminAccess } from "@/lib/data/admin-access";

/**
 * Admin panel shell (TODO.md §25).
 *
 * requireAdminAccess() runs here so an unauthorized visitor is redirected
 * before any child page renders — same pattern as ProjectLayout +
 * requireProjectAccess() (src/app/projects/[id]/layout.tsx). Each page below
 * also calls requireAdminAccess() itself before touching any service-role
 * query, matching how every project page calls requireProjectAccess()
 * directly rather than trusting the layout alone.
 *
 * A static, always-visible nav rather than the collapsible client-side
 * ProjectSidebar: this whole panel is read-only and has five destinations,
 * so a client component just to toggle a mobile drawer isn't earning its
 * keep here — the brief's own read-only, no-Client-Component framing.
 */

export const metadata: Metadata = { title: "Admin — Guidon" };

const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/logs", label: "Logs" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminAccess();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background-secondary">
        <div className="container mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Admin panel</h1>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Signed in as {user.email ?? user.id} — instance-wide view, bypasses per-organization access.
          </p>
          <nav className="flex flex-wrap gap-1" aria-label="Admin">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
