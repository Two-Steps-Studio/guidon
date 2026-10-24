"use client";

import { isModuleVisible } from "@/lib/work/project-modules";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePinnedTasks } from "@/components/work/pinned-tasks-context";
import { usePinnedProjects } from "@/components/projects/pinned-projects-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GuidonMark } from "@/components/layout/guidon-mark";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { FeedbackMenuItem } from "@/components/layout/feedback-dialog";
import type { SwitchableProject } from "@/lib/data/project-access";
import type { Theme } from "@/lib/theme";
import {
  LayoutDashboard,
  ListChecks,
  FileText,
  Building2,
  CheckSquare,
  CalendarDays,
  GitBranch,
  FolderOpen,
  BookOpen,
  Cpu,
  Brain,
  Network,
  Users,
  Activity,
  Settings,
  ShieldCheck,
  Plug,
  ScrollText,
  User,
  LogOut,
  MessageSquarePlus,
  Ticket,
  Puzzle,
  Images,
  Sparkles,
  Pin,
} from "lucide-react";

export const GLOBAL_NAV = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/my-tasks", labelKey: "myTasks", icon: ListChecks },
  { href: "/projects", labelKey: "projects", icon: FileText },
  { href: "/organizations", labelKey: "organizations", icon: Building2 },
  { href: "/plugins", labelKey: "plugins", icon: Puzzle },
  { href: "/marketplace", labelKey: "marketplace", icon: Puzzle },
  { href: "/my-modules", labelKey: "myModules", icon: Puzzle },
] as const;

export interface ProjectNavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
}

export interface ProjectNavGroup {
  labelKey: string | null;
  items: ProjectNavItem[];
}

/**
 * Carries forward the nav grouping/labels from the pre-existing, uncommitted
 * local edit to the old project-sidebar.tsx (Task Board instead of Board,
 * Files moved into Work, "Project" group label) rather than reverting it -
 * see the spec addendum's note on this. Labels are translation keys under
 * the "nav" namespace, resolved with `t()` at render time rather than
 * stored as literal English text, since this array lives at module scope
 * outside the component's translation context.
 *
 * `satisfies ProjectNavGroup[]` (rather than a `: ProjectNavGroup[]`
 * annotation) is combined with `as const` deliberately: an annotation
 * would widen every `labelKey` back to `string` on this binding, silently
 * undoing the narrowing `as const` is here for. `satisfies` still checks
 * shape against `ProjectNavGroup[]` but keeps the literal types, so a
 * typo'd `labelKey` is a compile error against the `next-intl` message
 * augmentation in global.d.ts.
 */
export const PROJECT_NAV = [
  {
    labelKey: null,
    items: [{ href: "", labelKey: "overview", icon: LayoutDashboard }],
  },
  {
    labelKey: "workGroup",
    items: [
      { href: "work", labelKey: "taskBoard", icon: CheckSquare },
      { href: "calendar", labelKey: "calendar", icon: CalendarDays },
      { href: "roadmap", labelKey: "roadmap", icon: GitBranch },
      { href: "files", labelKey: "files", icon: FolderOpen },
    ],
  },
  {
    labelKey: "knowledgeGroup",
    items: [
      { href: "knowledge", labelKey: "knowledge", icon: BookOpen },
      { href: "decisions", labelKey: "decisions", icon: FileText },
      { href: "references", labelKey: "moodboard", icon: Images },
      { href: "technology", labelKey: "technologies", icon: Cpu },
    ],
  },
  {
    labelKey: "contextGroup",
    items: [
      { href: "memory", labelKey: "memory", icon: Brain },
      { href: "context", labelKey: "graph", icon: Network },
      { href: "modules", labelKey: "customModules", icon: Puzzle },
    ],
  },
  {
    labelKey: "projectGroup",
    items: [
      { href: "members", labelKey: "members", icon: Users },
      { href: "activity", labelKey: "activity", icon: Activity },
      { href: "settings", labelKey: "settings", icon: Settings },
    ],
  },
] as const satisfies ProjectNavGroup[];

/**
 * A group's items minus the modules the project has switched off (migration
 * 055). Generic so each group keeps its literal item types - labelKey stays
 * a typed message key for t(), see PROJECT_NAV's comment above.
 */
export function visibleNavItems<T extends readonly { href: string }[]>(
  items: T,
  disabledModules: readonly string[] | null | undefined
): T[number][] {
  return items.filter((item) => isModuleVisible(item.href, disabledModules));
}

const ADMIN_NAV = [
  { href: "/admin", labelKey: "overview", icon: ShieldCheck },
  { href: "/admin/organizations", labelKey: "organizations", icon: Building2 },
  { href: "/admin/users", labelKey: "users", icon: Users },
  { href: "/admin/integrations", labelKey: "integrations", icon: Plug },
  { href: "/admin/logs", labelKey: "logs", icon: ScrollText },
  { href: "/admin/feedback", labelKey: "feedback", icon: MessageSquarePlus },
  { href: "/admin/promo-codes", labelKey: "promoCodes", icon: Ticket },
] as const;

export interface AppSidebarProps {
  user?: {
    email?: string;
    full_name?: string;
    avatar_url?: string;
  };
  projectId?: string;
  currentProjectName?: string;
  projects?: SwitchableProject[];
  projectColor?: string;
  /** Resolved server-side from the theme cookie - see app-shell.tsx. */
  currentTheme?: Theme;
  /** Guidon Cloud with Stripe configured - see app-shell.tsx. */
  showUpgrade?: boolean;
  /** projects.disabled_modules (migration 055) - sections hidden from the project nav. */
  disabledModules?: string[];
}

/** The person's pinned tasks (migration 074) - each opens its task on its board. */
function PinnedTasksGroup() {
  const t = useTranslations("nav");
  const pinned = usePinnedTasks();
  if (!pinned || pinned.tasks.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("pinnedTasks")}</SidebarGroupLabel>
      <SidebarMenu>
        {pinned.tasks.map((task) => (
          <SidebarMenuItem key={task.id}>
            <SidebarMenuButton asChild tooltip={task.project_name ? `${task.project_name} · ${task.title}` : task.title}>
              <Link href={`/projects/${task.project_id}/work?openTask=${task.id}`}>
                <Pin />
                <span className={task.is_done ? "text-muted-foreground line-through" : undefined}>{task.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** The person's pinned projects, shown on every app page including dashboard. */
function PinnedProjectsGroup() {
  const t = useTranslations("nav");
  const pinned = usePinnedProjects();
  if (!pinned || pinned.projects.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("pinnedProjects")}</SidebarGroupLabel>
      <SidebarMenu>
        {pinned.projects.map((project) => (
          <SidebarMenuItem key={project.id}>
            <SidebarMenuButton asChild tooltip={project.name}>
              <Link href={`/projects/${project.id}`}>
                <Pin />
                <span>{project.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AppSidebar({
  user,
  projectId,
  currentProjectName,
  projects,
  projectColor,
  currentTheme = "system",
  showUpgrade = false,
  disabledModules,
}: AppSidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  const isGlobalActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const isProjectActive = (href: string) => {
    if (!projectId) return false;
    if (href === "") return pathname === `/projects/${projectId}`;
    return pathname === `/projects/${projectId}/${href}`;
  };

  const activeStyle = projectColor
    ? ({
        backgroundColor: `${projectColor}20`,
        color: projectColor,
        "--tw-ring-color": projectColor,
      } as React.CSSProperties)
    : undefined;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center justify-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:px-0">
          <GuidonMark className="hidden h-7 w-7 text-sidebar-foreground group-data-[collapsible=icon]:block" />
          <Image
            src="/assets/guidon-wordmark.png"
            alt="Guidon"
            width={769}
            height={285}
            className="h-12 w-auto dark:invert group-data-[collapsible=icon]:hidden"
          />
        </Link>
        {projectId && (
          <ProjectSwitcher
            projectId={projectId}
            currentProjectName={currentProjectName ?? ""}
            projects={projects ?? []}
          />
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {GLOBAL_NAV.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isGlobalActive(item.href)}
                  tooltip={t(item.labelKey)}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <PinnedProjectsGroup />
        <PinnedTasksGroup />

        {projectId &&
          PROJECT_NAV.map((group, groupIndex) => {
            const items = visibleNavItems(group.items, disabledModules);
            if (items.length === 0) return null;
            return (
            <SidebarGroup key={group.labelKey ?? `project-group-${groupIndex}`}>
              {group.labelKey && (
                <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
              )}
              <SidebarMenu>
                {items.map((item) => {
                  const active = isProjectActive(item.href);
                  const href = `/projects/${projectId}${item.href ? `/${item.href}` : ""}`;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={t(item.labelKey)}
                        className={
                          active
                            ? "focus-visible:ring-2 focus-visible:ring-(--tw-ring-color)"
                            : undefined
                        }
                        style={active ? activeStyle : undefined}
                      >
                        <Link href={href}>
                          <item.icon />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
            );
          })}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("adminGroup")}</SidebarGroupLabel>
            <SidebarMenu>
              {ADMIN_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={t(item.labelKey)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      {user && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                tooltip={user.full_name || user.email}
              >
                <Link href="/profile">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback>
                      {user.full_name?.[0] || user.email?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {user.full_name || t("user")}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <User className="ml-auto h-4 w-4 text-muted-foreground" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {showUpgrade && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t("upgradePlan")} isActive={isGlobalActive("/upgrade")}>
                  <Link href="/upgrade">
                    <Sparkles />
                    <span>{t("upgradePlan")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              {/* /auth/logout (auth/logout/logout-client.tsx) already signs
                  the user out on visit - nothing anywhere in the UI linked
                  to it, so there was no way to log out short of typing the
                  URL by hand. */}
              <SidebarMenuButton asChild tooltip={t("logOut")}>
                <Link href="/auth/logout">
                  <LogOut />
                  <span>{t("logOut")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <FeedbackMenuItem />
            <SidebarMenuItem className="px-2 group-data-[collapsible=icon]:hidden">
              <ThemeSwitcher currentTheme={currentTheme} />
            </SidebarMenuItem>
            <SidebarMenuItem className="px-2 group-data-[collapsible=icon]:hidden">
              <LanguageSwitcher />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
