import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FolderKanban,
  Settings,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileText,
  Brain,
  Network,
  Calendar,
  Users,
} from "lucide-react";
import { canWriteProject, requireProjectAccess } from "@/lib/data/project-access";
import { getProjectStats } from "@/lib/data/project-stats";
import { EditProjectDialog } from "./edit-project-dialog";

/**
 * Project overview — Server Component (TODO.md §34).
 *
 * requireProjectAccess() is cached (see src/lib/data/project-access.ts), so
 * calling it again here after the layout already did costs no extra query.
 * The two data calls that ARE new — project and stats — run without a
 * client-side loading state because the whole page waits for them before
 * any HTML reaches the browser.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const access = await requireProjectAccess(projectId);
  const stats = await getProjectStats(projectId);
  const { project } = access;

  const quickAccess = [
    {
      href: "work",
      icon: FolderKanban,
      title: "Tasks",
      description: "Manage and track project tasks",
      metric: `${stats.total_tasks} tasks`,
      metricIcon: CheckCircle2,
    },
    {
      href: "roadmap",
      icon: TrendingUp,
      title: "Roadmap",
      description: "Project phases and timeline",
      metric: `${stats.total_phases} phases`,
      metricIcon: Calendar,
    },
    {
      href: "context",
      icon: Network,
      title: "Context",
      description: "Decisions, relations, and sources",
      metric: `${stats.total_decisions} decisions`,
      metricIcon: Brain,
    },
    {
      href: "memory",
      icon: Brain,
      title: "Memory",
      description: "Project knowledge and insights",
      metric: `${stats.total_memory} items`,
      metricIcon: FileText,
    },
    {
      href: "files",
      icon: FileText,
      title: "Files",
      description: "Project documents and assets",
      metric: `${stats.total_files} files`,
      metricIcon: FileText,
    },
    {
      href: "settings",
      icon: Settings,
      title: "Settings",
      description: "Project configuration",
      metric: "Manage team",
      metricIcon: Users,
    },
  ] as const;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <Badge variant={project.status === "active" ? "default" : "secondary"}>
              {project.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">{project.description || "No description"}</p>
        </div>
        {canWriteProject(access.role) && (
          <EditProjectDialog
            project={{ id: project.id, name: project.name, description: project.description }}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_tasks}</div>
            <p className="text-xs text-muted-foreground">{stats.completed_tasks} completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.in_progress_tasks}</div>
            <p className="text-xs text-muted-foreground">Active tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completion_percentage}%</div>
            <p className="text-xs text-muted-foreground">Project progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Roadmap</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.completed_phases}/{stats.total_phases}
            </div>
            <p className="text-xs text-muted-foreground">Phases completed</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Quick Access</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickAccess.map((item) => (
            <Link key={item.href} href={`/projects/${projectId}/${item.href}`}>
              <Card className="cursor-pointer hover:border-primary transition-colors h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <item.icon className="h-5 w-5" />
                    {item.title}
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <item.metricIcon className="h-4 w-4 mr-1" />
                    {item.metric}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
