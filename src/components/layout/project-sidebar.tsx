'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProjectSwitcher } from '@/components/layout/project-switcher';
import type { SwitchableProject } from '@/lib/data/project-access';
import {
  LayoutDashboard,
  CheckSquare,
  GitBranch,
  Network,
  BookOpen,
  Cpu,
  FileText,
  Brain,
  FolderOpen,
  Settings,
  Users,
  Activity,
  Menu,
  X,
  ChevronRight,
  User,
} from 'lucide-react';

interface ProjectSidebarProps {
  projectId: string;
  currentProjectName: string;
  projects: SwitchableProject[];
  children: React.ReactNode;
  user?: {
    email?: string;
    full_name?: string;
    avatar_url?: string;
  };
  projectColor?: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Guidon project workspace navigation.
 *
 * Grouped rather than flat so the four pillars of the product — the work,
 * what the team knows, why it decided that, and the project's own config —
 * stay legible as more surfaces are added.
 */
const navGroups: NavGroup[] = [
  {
    label: null,
    items: [{ href: '', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Work',
    items: [
      { href: 'work', label: 'Board', icon: CheckSquare },
      { href: 'roadmap', label: 'Roadmap', icon: GitBranch },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { href: 'knowledge', label: 'Knowledge', icon: BookOpen },
      { href: 'decisions', label: 'Decisions', icon: FileText },
      { href: 'files', label: 'Files', icon: FolderOpen },
      { href: 'technology', label: 'Technologies', icon: Cpu },
    ],
  },
  {
    label: 'Context',
    items: [
      { href: 'memory', label: 'Memory', icon: Brain },
      { href: 'context', label: 'Graph', icon: Network },
    ],
  },
  {
    label: null,
    items: [
      { href: 'members', label: 'Members', icon: Users },
      { href: 'activity', label: 'Activity', icon: Activity },
      { href: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function ProjectSidebar({ projectId, currentProjectName, projects, children, user, projectColor }: ProjectSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '') {
      return pathname === `/projects/${projectId}`;
    }
    return pathname === `/projects/${projectId}/${href}`;
  };

  const activeStyle = projectColor ? {
    backgroundColor: `${projectColor}20`,
    color: projectColor,
    borderLeftColor: projectColor,
  } : {};

  return (
    <div className="min-h-screen bg-background h-screen flex flex-col">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <span className="font-semibold">Project</span>
        <div className="w-8" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50
            w-56 border-r border-border bg-background-secondary
            transform transition-transform duration-200 ease-in-out
            flex flex-col h-screen
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="p-3 flex-1 overflow-y-auto">
            <div className="mb-2 border-b border-border pb-2">
              <ProjectSwitcher projectId={projectId} currentProjectName={currentProjectName} projects={projects} />
            </div>

            <nav className="space-y-4" aria-label="Project">
              {navGroups.map((group, groupIndex) => (
                <div key={group.label ?? `group-${groupIndex}`}>
                  {group.label && (
                    <h2 className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </h2>
                  )}

                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      const href = `/projects/${projectId}${item.href ? `/${item.href}` : ''}`;

                      return (
                        <Link
                          key={item.href}
                          href={href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`
                            flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm
                            transition-colors border-l-2
                            ${active
                              ? 'font-medium'
                              : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground border-transparent'
                            }
                          `}
                          style={active ? activeStyle : undefined}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                          {active && <ChevronRight className="ml-auto h-3 w-3" />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          {/* User Profile Section at Bottom */}
          {user && (
            <div className="p-3 border-t border-border bg-background">
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-surface-hover transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar_url || undefined} />
                  <AvatarFallback>
                    {user.full_name?.[0] || user.email?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.full_name || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <User className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          )}
        </aside>

        {/* Overlay for mobile */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
