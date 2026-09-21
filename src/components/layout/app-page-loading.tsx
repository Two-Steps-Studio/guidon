import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/data/current-user";

/**
 * Loading state for the top-level app pages (dashboard, projects,
 * organizations, profile). Those pages render their own AppShell, so a
 * bare skeleton would flash without the sidebar; this keeps the shell and
 * only skeletons the content. getCurrentUser() is request-cached, so the
 * page reuses the same lookup.
 */
export async function AppPageLoading() {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("common")]);

  return (
    <AppShell user={user}>
      <div
        role="status"
        aria-busy="true"
        className="container mx-auto max-w-7xl space-y-6 px-6 py-8"
      >
        <span className="sr-only">{t("loading")}</span>
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </AppShell>
  );
}
