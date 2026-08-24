"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
} from "lucide-react";

const GLOBAL_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FileText },
  { href: "/organizations", label: "Organizations", icon: Building2 },
];

interface ProjectNavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface ProjectNavGroup {
  label: string | null;
  items: ProjectNavItem[];
}

/**
 * Carries forward the nav grouping/labels from the pre-existing, uncommitted
 * local edit to the old project-sidebar.tsx (Task Board instead of Board,
 * Files moved into Work, "Project" group label) rather than reverting it —
 * see the spec addendum's note on this.
 */
const PROJECT_NAV: ProjectNavGroup[] = [
  { label: null, items: [{ href: "", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Work",
    items: [
      { href: "work", label: "Task Board", icon: CheckSquare },
      { href: "roadmap", label: "Roadmap", icon: GitBranch },
      { href: "files", label: "Files", icon: FolderOpen },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "knowledge", label: "Knowledge", icon: BookOpen },
      { href: "decisions", label: "Decisions", icon: FileText },
      { href: "technology", label: "Technologies", icon: Cpu },
    ],
  },
  {
    label: "Context",
    items: [
      { href: "memory", label: "Memory", icon: Brain },
      { href: "context", label: "Graph", icon: Network },
    ],
  },
  {
    label: "Project",
    items: [
      { href: "members", label: "Members", icon: Users },
      { href: "activity", label: "Activity", icon: Activity },
      { href: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: ShieldCheck },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
];

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
                <SidebarMenuButton asChild isActive={isGlobalActive(item.href)} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {projectId &&
          PROJECT_NAV.map((group, groupIndex) => (
            <SidebarGroup key={group.label ?? `project-group-${groupIndex}`}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isProjectActive(item.href);
                  const href = `/projects/${projectId}${item.href ? `/${item.href}` : ""}`;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className={active ? "focus-visible:ring-2 focus-visible:ring-[--tw-ring-color]" : undefined}
                        style={active ? activeStyle : undefined}
                      >
                        <Link href={href}>
                          <item.icon />
                          <span>{item.label}</span>
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
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarMenu>
              {ADMIN_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
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
                    <span className="truncate text-sm font-medium">{user.full_name || "User"}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <User className="ml-auto h-4 w-4 text-muted-foreground" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
