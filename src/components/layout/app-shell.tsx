import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSidebar, type AppSidebarProps } from "@/components/layout/app-sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { SiteFooter } from "@/components/layout/site-footer";
import { DEFAULT_THEME, THEME_COOKIE, isSupportedTheme } from "@/lib/theme";
import { hasDirectDatabase } from "@/lib/db/pool";
import { isBillingConfigured } from "@/lib/billing/stripe";

type AppShellProps = AppSidebarProps & { children: React.ReactNode };

/**
 * Reads the sidebar's own persistence cookie server-side so the first paint
 * already matches the user's last collapsed/expanded choice - the shadcn
 * sidebar primitive writes this cookie client-side on every toggle
 * (src/components/ui/sidebar.tsx's SIDEBAR_COOKIE_NAME), this just reads it
 * back before rendering instead of always defaulting to expanded.
 */
export async function AppShell({ children, ...sidebarProps }: AppShellProps) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const currentTheme = themeCookie && isSupportedTheme(themeCookie) ? themeCookie : DEFAULT_THEME;
  const tNav = await getTranslations("nav");

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        {...sidebarProps}
        currentTheme={currentTheme}
        // Plans only exist on Guidon Cloud (self-hosted has no limits - see
        // the billing page), and upgrading needs Stripe.
        showUpgrade={!hasDirectDatabase() && isBillingConfigured()}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger aria-label={tNav("toggleSidebar")} />
            </TooltipTrigger>
            <TooltipContent side="bottom">{tNav("toggleSidebar")}</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex-1" />
          <CommandPalette currentProjectId={sidebarProps.projectId} disabledModules={sidebarProps.disabledModules} />
          <NotificationsBell />
        </header>
        {children}
        <SiteFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
