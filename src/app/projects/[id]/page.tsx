import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
 * Project overview - Server Component (TODO.md §34).
 *
 * requireProjectAccess() is cached (see src/lib/data/project-access.ts), so
 * calling it again here after the layout already did costs no extra query.
 * The two data calls that ARE new - project and stats - run without a
 * client-side loading state because the whole page waits for them before
 * any HTML reaches the browser.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const t = await getTranslations("projects.detail");
  const tCommon = await getTranslations("common");
  // getProjectStats doesn't depend on requireProjectAccess's result (both
  // only need projectId), so they run concurrently instead of stats paying
  // for a second full round-trip after access resolves.
  const [access, stats] = await Promise.all([requireProjectAccess(projectId), getProjectStats(projectId)]);
  const { project } = access;

  const quickAccess = [
    {
      href: "work",
      icon: FolderKanban,
      title: t("tasksTitle"),
      description: t("tasksDescription"),
      metric: t("tasksMetric", { count: stats.total_tasks }),
      metricIcon: CheckCircle2,
    },
    {
      href: "roadmap",
      icon: TrendingUp,
      title: t("roadmapTitle"),
      description: t("roadmapDescription"),
      metric: t("roadmapMetric", { count: stats.total_phases }),
      metricIcon: Calendar,
    },
    {
      href: "context",
      icon: Network,
      title: t("contextTitle"),
      description: t("contextDescription"),
      metric: t("contextMetric", { count: stats.total_decisions }),
      metricIcon: Brain,
    },
    {
      href: "memory",
      icon: Brain,
      title: t("memoryTitle"),
      description: t("memoryDescription"),
      metric: t("memoryMetric", { count: stats.total_memory }),
      metricIcon: FileText,
    },
    {
      href: "files",
      icon: FileText,
      title: t("filesTitle"),
      description: t("filesDescription"),
      metric: t("filesMetric", { count: stats.total_files }),
      metricIcon: FileText,
    },
    {
      href: "settings",
      icon: Settings,
      title: t("settingsTitle"),
      description: t("settingsDescription"),
      metric: t("settingsMetric"),
      metricIcon: Users,
    },
  ] as const;

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.project_type && (
              <Badge variant="outline">
                {tCommon("projectType", { type: project.project_type })}
              </Badge>
            )}
            {project.methodology === "scrum" && (
              <Badge variant="outline">{tCommon("projectMethodology", { methodology: "scrum" })}</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{project.description || t("noDescription")}</p>
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
            <CardTitle className="text-sm font-medium">{t("totalTasks")}</CardTitle>
            <FolderKanban className="h-4 w-4" style={project.color ? { color: project.color } : undefined} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_tasks}</div>
            <p className="text-xs text-muted-foreground">{t("completedSuffix", { count: stats.completed_tasks })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("inProgress")}</CardTitle>
            <Clock className="h-4 w-4" style={project.color ? { color: project.color } : undefined} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.in_progress_tasks}</div>
            <p className="text-xs text-muted-foreground">{t("activeTasks")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("completion")}</CardTitle>
            <TrendingUp className="h-4 w-4" style={project.color ? { color: project.color } : undefined} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completion_percentage}%</div>
            <p className="text-xs text-muted-foreground">{t("projectProgress")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("roadmap")}</CardTitle>
            <Calendar className="h-4 w-4" style={project.color ? { color: project.color } : undefined} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.completed_phases}/{stats.total_phases}
            </div>
            <p className="text-xs text-muted-foreground">{t("phasesCompleted")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">{t("quickAccess")}</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickAccess.map((item) => (
            <Link key={item.href} href={`/projects/${projectId}/${item.href}`}>
              <Card 
                className="cursor-pointer hover:border-primary transition-colors h-full"
                style={project.color ? { '--tw-ring-color': project.color } as React.CSSProperties : undefined}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <item.icon className="h-5 w-5" style={project.color ? { color: project.color } : undefined} />
                    {item.title}
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <item.metricIcon className="h-4 w-4 mr-1" style={project.color ? { color: project.color } : undefined} />
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
