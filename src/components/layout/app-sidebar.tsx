"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import type { SwitchableProject } from "@/lib/data/project-access";
import {
  LayoutDashboard,
  FileText,
  Building2,
  CheckSquare,
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
} from "lucide-react";

const GLOBAL_NAV = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/projects", labelKey: "projects", icon: FileText },
  { href: "/organizations", labelKey: "organizations", icon: Building2 },
] as const;

interface ProjectNavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
}

interface ProjectNavGroup {
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
 */
const PROJECT_NAV: ProjectNavGroup[] = [
  { labelKey: null, items: [{ href: "", labelKey: "overview", icon: LayoutDashboard }] },
  {
    labelKey: "workGroup",
    items: [
      { href: "work", labelKey: "taskBoard", icon: CheckSquare },
      { href: "roadmap", labelKey: "roadmap", icon: GitBranch },
      { href: "files", labelKey: "files", icon: FolderOpen },
    ],
  },
  {
    labelKey: "knowledgeGroup",
    items: [
      { href: "knowledge", labelKey: "knowledge", icon: BookOpen },
      { href: "decisions", labelKey: "decisions", icon: FileText },
      { href: "technology", labelKey: "technologies", icon: Cpu },
    ],
  },
  {
    labelKey: "contextGroup",
    items: [
      { href: "memory", labelKey: "memory", icon: Brain },
      { href: "context", labelKey: "graph", icon: Network },
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
];

const ADMIN_NAV = [
  { href: "/admin", labelKey: "overview", icon: ShieldCheck },
  { href: "/admin/organizations", labelKey: "organizations", icon: Building2 },
  { href: "/admin/users", labelKey: "users", icon: Users },
  { href: "/admin/integrations", labelKey: "integrations", icon: Plug },
  { href: "/admin/logs", labelKey: "logs", icon: ScrollText },
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
}

export function AppSidebar({
  user,
  projectId,
  currentProjectName,
  projects,
  projectColor,
}: AppSidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  const isGlobalActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
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
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <Image
            src="/assets/guidon-wordmark.png"
            alt="Guidon"
            width={769}
            height={285}
            className="h-5 w-auto dark:invert group-data-[collapsible=icon]:hidden"
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
                <SidebarMenuButton asChild isActive={isGlobalActive(item.href)} tooltip={t(item.labelKey)}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {projectId &&
          PROJECT_NAV.map((group, groupIndex) => (
            <SidebarGroup key={group.labelKey ?? `project-group-${groupIndex}`}>
              {group.labelKey && <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>}
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isProjectActive(item.href);
                  const href = `/projects/${projectId}${item.href ? `/${item.href}` : ""}`;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={t(item.labelKey)}
                        className={active ? "focus-visible:ring-2 focus-visible:ring-(--tw-ring-color)" : undefined}
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
          ))}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("adminGroup")}</SidebarGroupLabel>
            <SidebarMenu>
              {ADMIN_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={t(item.labelKey)}>
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
              <SidebarMenuButton asChild size="lg" tooltip={user.full_name || user.email}>
                <Link href="/profile">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback>{user.full_name?.[0] || user.email?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{user.full_name || t("user")}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <User className="ml-auto h-4 w-4 text-muted-foreground" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
            <SidebarMenuItem className="px-2">
              <LanguageSwitcher />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
