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
  FileText,
  Brain,
  FolderOpen,
  Settings,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

interface ProjectSidebarProps {
  projectId: string;
  children: React.ReactNode;
}

const navItems = [
  { href: '', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'tasks', label: 'Tasks', icon: CheckSquare },
  { href: 'roadmap', label: 'Roadmap', icon: GitBranch },
  { href: 'context', label: 'Context', icon: Network },
  { href: 'decisions', label: 'Decisions', icon: FileText },
  { href: 'memory', label: 'Memory', icon: Brain },
  { href: 'files', label: 'Files', icon: FolderOpen },
  { href: 'settings', label: 'Settings', icon: Settings },
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
            w-64 bg-muted/30 border-r
            transform transition-transform duration-200 ease-in-out
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="p-4">
            <div className="hidden lg:block mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Project Navigation
              </h2>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const href = `/projects/${projectId}${item.href ? `/${item.href}` : ''}`;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium
                      transition-colors
                      ${active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {active && <ChevronRight className="h-3 w-3 ml-auto" />}
                  </Link>
                );
              })}
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
