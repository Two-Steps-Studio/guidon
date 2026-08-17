'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

interface ProjectSidebarProps {
  projectId: string;
  children: React.ReactNode;
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
      { href: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function ProjectSidebar({ projectId, children }: ProjectSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '') {
      return pathname === `/projects/${projectId}`;
    }
    return pathname === `/projects/${projectId}/${href}`;
  };

  return (
    <div className="min-h-screen bg-background">
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

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50
            w-56 border-r border-border bg-background-secondary
            transform transition-transform duration-200 ease-in-out
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="p-3">
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
                            transition-colors
                            ${active
                              ? 'bg-surface-active font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                            }
                          `}
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
