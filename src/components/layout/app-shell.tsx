import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar, type AppSidebarProps } from "@/components/layout/app-sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { DEFAULT_THEME, THEME_COOKIE, isSupportedTheme } from "@/lib/theme";

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

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar {...sidebarProps} currentTheme={currentTheme} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex-1" />
          <CommandPalette currentProjectId={sidebarProps.projectId} />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
