"use client";

import { initialsFor } from "@/lib/people";
import type { AdminPage } from "@/lib/admin/permissions";
import { isModuleVisible } from "@/lib/work/project-modules";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { writeCollapsedGroups } from "@/lib/sidebar-groups";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePinnedProjects } from "@/components/projects/pinned-projects-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GuidonMark } from "@/components/layout/guidon-mark";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { FeedbackMenuItem } from "@/components/layout/feedback-dialog";
import { WalkthroughMenuItem } from "@/components/layout/walkthrough-tour";
import type { SwitchableProject } from "@/lib/data/project-access";
import type { Theme } from "@/lib/theme";
import type { ProjectModuleLink } from "@/lib/data/project-module-navigation";
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
  CreditCard,
  Puzzle,
  Images,
  Sparkles,
  Pin,
  Store,
  Boxes,
  Blocks,
  ChevronDown,
  TrendingUp,
  Search,
  LayoutTemplate,
} from "lucide-react";

export const GLOBAL_NAV = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/my-tasks", labelKey: "myTasks", icon: ListChecks },
  { href: "/projects", labelKey: "projects", icon: FileText },
  { href: "/organizations", labelKey: "organizations", icon: Building2 },
  { href: "/plugins", labelKey: "plugins", icon: Plug },
  { href: "/marketplace", labelKey: "marketplace", icon: Store },
  { href: "/my-modules", labelKey: "myModules", icon: Boxes },
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
      { href: "whiteboard", labelKey: "whiteboard", icon: LayoutTemplate },
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
      { href: "brief", labelKey: "agentBrief", icon: ScrollText },
      { href: "context", labelKey: "graph", icon: Network },
      { href: "modules", labelKey: "customModules", icon: Puzzle },
    ],
  },
  {
    labelKey: "projectGroup",
    items: [
      { href: "members", labelKey: "members", icon: Users },
      { href: "approvals", labelKey: "approvals", icon: ShieldCheck },
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
  { href: "/admin/audit", labelKey: "adminAudit", icon: ScrollText },
  { href: "/admin/feedback", labelKey: "feedback", icon: MessageSquarePlus },
  { href: "/admin/funnel", labelKey: "funnel", icon: TrendingUp },
  { href: "/admin/search", labelKey: "searchQuality", icon: Search },
  { href: "/admin/promo-codes", labelKey: "promoCodes", icon: Ticket },
  { href: "/admin/billing", labelKey: "billingPrices", icon: CreditCard },
  { href: "/admin/modules", labelKey: "moduleReview", icon: Blocks },
  { href: "/admin/flags", labelKey: "adminFlags", icon: ShieldCheck },
  { href: "/admin/operations", labelKey: "adminOperations", icon: ScrollText },
] as const;

export interface AppSidebarProps {
  adminPages?: readonly AdminPage[];
  user?: {
    email?: string;
    full_name?: string;
    avatar_url?: string;
  };
  /** User id (from AppShell's getCurrentUser): keys the walkthrough's
   *  per-account "seen" marker in localStorage. Undefined when signed out. */
  userId?: string;
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
  moduleLinks?: ProjectModuleLink[];
  /**
   * Agents' approval requests (migration 102): null hides the Approvals link
   * (no agent ever asked here, so a team without AI never sees it); `pending`
   * is the badge.
   */
  approvals?: { pending: number } | null;
  /** Sections collapsed earlier (sidebar_groups cookie, read in app-shell.tsx). */
  collapsedGroups?: string[];
}

/**
 * A section heading that folds its items away. In the narrow icon rail every
 * icon stays visible (folding there would hide them with no heading to bring
 * them back); on mobile the sheet always shows labels, so it stays focusable.
 */
function useSectionFold(collapsed: ReadonlySet<string>, toggle: (key: string) => void) {
  const { state, isMobile } = useSidebar();
  const iconRail = state === "collapsed" && !isMobile;
  return (key: string, id: string, label: string) => {
    const folded = collapsed.has(key);
    return {
      label: (
        <SidebarGroupLabel asChild>
          <button type="button" tabIndex={iconRail ? -1 : 0} aria-expanded={!folded} aria-controls={id} onClick={() => toggle(key)} className="w-full justify-between focus-visible:ring-2">
            <span className="truncate">{label}</span>
            <ChevronDown aria-hidden className={cn("size-3 shrink-0 transition-transform", folded && "-rotate-90")} />
          </button>
        </SidebarGroupLabel>
      ),
      id,
      /** Folded: only the current page's link stays, so the active section is still visible. */
      shows: (active: boolean) => active || !folded || iconRail,
    };
  };
}

/** The person's pinned projects, shown on every app page including dashboard. */
function PinnedProjectsGroup({ fold }: { fold: ReturnType<typeof useSectionFold> }) {
  const t = useTranslations("nav");
  const pinned = usePinnedProjects();
  const pathname = usePathname();
  if (!pinned || pinned.projects.length === 0) return null;
  const section = fold("pinnedProjects", "nav-group-pinned", t("pinnedProjects"));

  return (
    <SidebarGroup>
      {section.label}
      <SidebarMenu id={section.id}>
        {pinned.projects.filter((project) => section.shows(pathname.startsWith(`/projects/${project.id}`))).map((project) => (
          <SidebarMenuItem key={project.id}>
            <SidebarMenuButton asChild tooltip={project.name}>
              <Link href={`/projects/${project.id}`}>
                <Avatar className="size-4 shrink-0 rounded-sm">
                  <AvatarImage src={project.avatar_url || undefined} alt="" className="object-cover" />
                  <AvatarFallback className="rounded-sm bg-transparent"><Pin className="size-4" /></AvatarFallback>
                </Avatar>
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
  userId,
  projectId,
  currentProjectName,
  projects,
  projectColor,
  currentTheme = "system",
  showUpgrade = false,
  disabledModules,
  moduleLinks = [],
  approvals = null,
  collapsedGroups = [],
  adminPages = [],
}: AppSidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(collapsedGroups));
  const fold = useSectionFold(collapsed, (key) => {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    setCollapsed(next);
    writeCollapsedGroups([...next]);
  });

  const isGlobalActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const isProjectActive = (href: string) => {
    if (!projectId) return false;
    if (href === "") return pathname === `/projects/${projectId}`;
    return pathname === `/projects/${projectId}/${href}`;
  };
  const extensions = fold("extensions", "nav-group-extensions", t("extensionsGroup"));
  const globalLink = (item: (typeof GLOBAL_NAV)[number]) => (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton asChild isActive={isGlobalActive(item.href)} tooltip={t(item.labelKey)}>
        <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
          <item.icon />
          <span>{t(item.labelKey)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  // Custom modules: one sidebar group per category the project gave them
  // (alphabetical), the uncategorized ones first under "Custom modules".
  const moduleGroups = groupModuleLinks(moduleLinks);

  const activeStyle = projectColor
    ? ({
        backgroundColor: `${projectColor}20`,
        // The label keeps the sidebar's own text colour: a project colour as
        // text on its own tint fails contrast for most colours (Lighthouse:
        // #0066ff on its tint was 3.9:1). The icon carries the colour instead.
        "--project-color": projectColor,
        "--tw-ring-color": projectColor,
      } as React.CSSProperties)
    : undefined;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center justify-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:px-0">
          <GuidonMark className="hidden h-12 w-7 text-sidebar-foreground group-data-[collapsible=icon]:block" />
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
            {GLOBAL_NAV.slice(0, 4).map(globalLink)}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          {extensions.label}
          <SidebarMenu id={extensions.id}>
            {GLOBAL_NAV.slice(4).filter(item => extensions.shows(isGlobalActive(item.href))).map(globalLink)}
          </SidebarMenu>
        </SidebarGroup>

        <PinnedProjectsGroup fold={fold} />

        {projectId &&
          PROJECT_NAV.map((group, groupIndex) => {
            const items = visibleNavItems(group.items, disabledModules).filter(
              (item) => item.href !== "approvals" || approvals !== null
            );
            if (items.length === 0) return null;
            const section = group.labelKey ? fold(group.labelKey, `project-nav-group-${groupIndex}`, t(group.labelKey)) : null;
            return (
            <SidebarGroup key={group.labelKey ?? `project-group-${groupIndex}`}>
              {section?.label}
              <SidebarMenu id={section?.id}>
                {items.filter((item) => section?.shows(isProjectActive(item.href)) ?? true).map((item) => {
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
                            ? "focus-visible:ring-2 focus-visible:ring-(--tw-ring-color) [&>svg]:text-(--project-color)"
                            : undefined
                        }
                        style={active ? activeStyle : undefined}
                      >
                        <Link href={href} aria-current={active ? "page" : undefined}>
                          <item.icon />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.href === "approvals" && approvals && approvals.pending > 0 && (
                        <SidebarMenuBadge>{approvals.pending}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
            );
          })}

        {projectId && moduleGroups.map((group, groupIndex) => {
          const section = fold(`module:${group.category ?? ""}`, `module-nav-group-${groupIndex}`, group.category ?? t("customModules"));
          return <SidebarGroup key={group.category ?? ""}>
          {section.label}
          <SidebarMenu id={section.id}>{group.links.filter(module => section.shows(pathname === module.href)).map(module => <SidebarMenuItem key={module.id}>
            <SidebarMenuButton asChild isActive={pathname === module.href} tooltip={module.name}>
              <Link href={module.href} aria-current={pathname === module.href ? "page" : undefined}><Puzzle /><span className="truncate">{module.name}</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>)}</SidebarMenu>
        </SidebarGroup>;
        })}

        {adminPages.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("adminGroup")}</SidebarGroupLabel>
            <SidebarMenu>
              {ADMIN_NAV.filter(item => adminPages.includes(item.href)).map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={t(item.labelKey)}
                  >
                    <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
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
                // Collapsed, the same 32 px square as the icons around it, not a 48 px tall one;
                // my-2 keeps the row 48 px so it doesn't jump on collapse (e2e board-layout).
                className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:my-2"
              >
                <Link href="/profile">
                  <Avatar className="size-6 shrink-0">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px] font-medium">
                      {initialsFor(user)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-medium">
                      {user.full_name || t("user")}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <User className="ml-auto h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
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
            <WalkthroughMenuItem userId={userId ?? null} />
            <FeedbackMenuItem />
            <SidebarMenuItem className="px-2 group-data-[collapsible=icon]:px-0">
              <ThemeSwitcher currentTheme={currentTheme} />
            </SidebarMenuItem>
            <SidebarMenuItem className="px-2 group-data-[collapsible=icon]:px-0">
              <LanguageSwitcher />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

function groupModuleLinks(links: ProjectModuleLink[]): { category: string | null; links: ProjectModuleLink[] }[] {
  const byCategory = new Map<string, ProjectModuleLink[]>();
  const uncategorized: ProjectModuleLink[] = [];
  for (const link of links) {
    if (!link.category) uncategorized.push(link);
    else byCategory.set(link.category, [...(byCategory.get(link.category) ?? []), link]);
  }
  return [
    ...(uncategorized.length ? [{ category: null, links: uncategorized }] : []),
    ...[...byCategory.keys()].sort((a, b) => a.localeCompare(b)).map((category) => ({ category, links: byCategory.get(category)! })),
  ];
}
