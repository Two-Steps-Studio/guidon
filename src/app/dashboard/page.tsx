import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  GitBranch,
  ListChecks,
  Network,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { displayName } from "@/lib/people";
import { PROJECT_LIST_SAFETY_CAP } from "@/lib/limits";
import {
  DUE_STATE_CLASSES,
  PRIORITY_DOT_CLASSES,
  dueState,
  formatDueDate,
  normalizeTaskPriority,
} from "@/lib/work/task-board";
import { cn } from "@/lib/utils";
import { configFor } from "@/app/projects/[id]/activity/action-config";
import type { Task } from "@/types/task";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  color: string | null;
  organization_id: string;
}

interface ActivityRow {
  id: string;
  project_id: string | null;
  user_id: string | null;
  action: string;
  created_at: string | Date;
  actor_label: string | null;
}

/** Project cards on the dashboard; the rest are one click away on /projects. */
const PROJECT_CARDS = 6;
const UPCOMING_TASKS = 6;
const ACTIVITY_ITEMS = 8;

function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/**
 * The signed-in person's morning view across every project they can see
 * (RLS decides which): their own open and overdue work first, then what
 * moved recently, then the projects with their progress. All reads go
 * through the data client, so this is one code path in both modes.
 */
async function loadDashboard(userId: string) {
  const db = dataClient(userId);
  const today = startOfTodayUtc();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [projectsRes, projectCountRes, myOpenRes, myOverdueRes, upcomingRes] = await Promise.all([
    db
      .from<ProjectRow>("projects")
      .select("id, name, description, avatar_url, color, organization_id")
      .order("updated_at", { ascending: false })
      .limit(PROJECT_LIST_SAFETY_CAP),
    db.from("projects").count(),
    db.from("tasks").eq("assignee_id", userId).neq("status", "done").count(),
    db.from("tasks").eq("assignee_id", userId).neq("status", "done").lt("due_date", today).count(),
    db
      .from<Task>("tasks")
      .select("*")
      .eq("assignee_id", userId)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(UPCOMING_TASKS),
  ]);
  for (const result of [projectsRes, projectCountRes, myOpenRes, myOverdueRes, upcomingRes]) {
    if (result.error) throw new Error(`Failed to load the dashboard: ${result.error.message}`);
  }

  const projects = projectsRes.data;
  const projectIds = projects.map((project) => project.id);
  const cardProjects = projects.slice(0, PROJECT_CARDS);

  const [inProgressRes, doneThisWeekRes, activityRes, ...progress] = projectIds.length
    ? await Promise.all([
        db.from("tasks").in("project_id", projectIds).in("status", ["in_progress", "ai_working"]).count(),
        db.from("tasks").in("project_id", projectIds).eq("status", "done").gte("updated_at", weekAgo).count(),
        db
          .from<ActivityRow>("activity_logs")
          .select("id, project_id, user_id, action, created_at, actor_label")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false })
          .limit(ACTIVITY_ITEMS),
        ...cardProjects.flatMap((project) => [
          db.from("tasks").eq("project_id", project.id).is("parent_task_id", null).count(),
          db.from("tasks").eq("project_id", project.id).is("parent_task_id", null).eq("status", "done").count(),
        ]),
      ])
    : [{ data: 0, error: null }, { data: 0, error: null }, { data: [] as ActivityRow[], error: null }];

  const activity = (activityRes.data ?? []) as ActivityRow[];
  const actorIds = [...new Set(activity.map((entry) => entry.user_id).filter((id): id is string => !!id))];
  const { data: actors } = actorIds.length
    ? await db
        .from<{ id: string; full_name: string | null; email: string }>("profiles")
        .select("id, full_name, email")
        .in("id", actorIds)
    : { data: [] };

  return {
    // Rendering compares activity times against this, not a fresh Date.now().
    now: Date.now(),
    projects: cardProjects.map((project, index) => ({
      ...project,
      total: Number(progress[index * 2]?.data ?? 0),
      done: Number(progress[index * 2 + 1]?.data ?? 0),
    })),
    projectNames: new Map(projects.map((project) => [project.id, project])),
    totalProjects: projectCountRes.data ?? 0,
    myOpen: myOpenRes.data ?? 0,
    myOverdue: myOverdueRes.data ?? 0,
    inProgress: Number(inProgressRes.data ?? 0),
    doneThisWeek: Number(doneThisWeekRes.data ?? 0),
    upcoming: upcomingRes.data ?? [],
    activity,
    actors: new Map((actors ?? []).map((actor) => [actor.id, actor])),
  };
}

function StatTile({
  label,
  value,
  icon: Icon,
  href,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  tone?: "danger";
}) {
  const body = (
    <Card className={cn("h-full transition-colors", href && "hover:border-primary/50")}>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            tone === "danger" && value > 0 ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className={cn("text-2xl font-bold tabular-nums", tone === "danger" && value > 0 && "text-danger")}>{value}</p>
          <p className="text-sm leading-tight text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const [t, tNav, tActivity, locale, user] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("nav"),
    getTranslations("activity"),
    getLocale(),
    getCurrentUser(),
  ]);
  const data = await loadDashboard(user.id);
  const firstName = (user.full_name || "").trim().split(/\s+/)[0] || tNav("user");
  const todayLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ago = (value: string | Date) => {
    const minutes = Math.round((new Date(value).getTime() - data.now) / 60_000);
    if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, "hour");
    return relative.format(Math.round(hours / 24), "day");
  };

  return (
    <AppShell user={user}>
      <div className="container mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground first-letter:uppercase">{todayLabel}</p>
            <h1 className="text-3xl font-bold">{t("greeting", { name: firstName })}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/my-tasks">
                <ListChecks className="mr-2 h-4 w-4" />
                {tNav("myTasks")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/organizations">
                <Plus className="mr-2 h-4 w-4" />
                {t("newProject")}
              </Link>
            </Button>
          </div>
        </div>

        {data.totalProjects === 0 ? (
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              {(
                [
                  [GitBranch, "emptyDecisionsTitle", "emptyDecisionsDesc"],
                  [Network, "emptyContextTitle", "emptyContextDesc"],
                  [BrainCircuit, "emptyMemoryTitle", "emptyMemoryDesc"],
                ] as const
              ).map(([Icon, title, description]) => (
                <Card key={title} className="border-border/50">
                  <CardHeader>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle>{t(title)}</CardTitle>
                    <CardDescription>{t(description)}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <EmptyState
              icon={FolderKanban}
              title={t("createFirstProjectTitle")}
              description={t("createFirstProjectDesc")}
              action={
                <Button asChild>
                  <Link href="/organizations?create=1">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("createFirstProjectButton")}
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label={t("statMyOpen")} value={data.myOpen} icon={ListChecks} href="/my-tasks" />
              <StatTile label={t("statOverdue")} value={data.myOverdue} icon={AlertTriangle} href="/my-tasks" tone="danger" />
              <StatTile label={t("statInProgress")} value={data.inProgress} icon={CircleDot} />
              <StatTile label={t("statDoneThisWeek")} value={data.doneThisWeek} icon={CheckCircle2} />
            </div>

            <div className="mb-10 grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-lg">{t("upcomingTitle")}</CardTitle>
                  <Link href="/my-tasks" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    {t("seeAll")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardHeader>
                <CardContent className="p-0">
                  {data.upcoming.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">{t("upcomingEmpty")}</p>
                  ) : (
                    <ul className="divide-y divide-border border-t border-border">
                      {data.upcoming.map((task) => {
                        const project = data.projectNames.get(task.project_id);
                        const due = dueState(task.due_date, task.status);
                        return (
                          <li key={task.id}>
                            <Link
                              href={`/projects/${task.project_id}/work?openTask=${task.id}`}
                              className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50"
                            >
                              <span
                                className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT_CLASSES[normalizeTaskPriority(task.priority)])}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{task.title}</span>
                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                                    style={project?.color ? { backgroundColor: project.color } : undefined}
                                    aria-hidden
                                  />
                                  <span className="truncate">{project?.name}</span>
                                </span>
                              </span>
                              {task.due_date && (
                                <span className={cn("shrink-0 text-xs tabular-nums", DUE_STATE_CLASSES[due])}>
                                  {formatDueDate(task.due_date)}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("activityTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.activity.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">{t("activityEmpty")}</p>
                  ) : (
                    <ul className="space-y-0 border-t border-border">
                      {data.activity.map((entry) => {
                        const Icon = configFor(entry.action).icon ?? ActivityIcon;
                        const project = entry.project_id ? data.projectNames.get(entry.project_id) : undefined;
                        const actor = entry.user_id ? data.actors.get(entry.user_id) : undefined;
                        return (
                          <li key={entry.id}>
                            <Link
                              href={project ? `/projects/${project.id}/activity` : "#"}
                              className="flex items-start gap-3 px-6 py-2.5 hover:bg-accent/50"
                            >
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 text-sm">
                                <span className="font-medium">{entry.actor_label || displayName(actor, tActivity("someone"))}</span>{" "}
                                <span className="text-muted-foreground">{tActivity("action", { action: entry.action }).toLowerCase()}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {project?.name} · {ago(entry.created_at)}
                                </span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("yourProjects")}</h2>
              {data.totalProjects > data.projects.length && (
                <Link href="/projects" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  {t("viewAll", { count: data.totalProjects })}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.projects.map((project) => {
                const percent = project.total ? Math.round((project.done / project.total) * 100) : 0;
                return (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="h-full transition-colors hover:border-primary/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Avatar className="h-6 w-6 rounded-md">
                            <AvatarImage src={project.avatar_url || undefined} alt="" className="object-cover" />
                            <AvatarFallback
                              className="rounded-md bg-primary/10 text-primary"
                              style={project.color ? { backgroundColor: `${project.color}22`, color: project.color } : undefined}
                            >
                              <FolderKanban className="h-3.5 w-3.5" />
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{project.name}</span>
                        </CardTitle>
                        {project.description && (
                          <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                          <span>{t("progress", { done: project.done, total: project.total })}</span>
                          <span className="tabular-nums">{percent}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${percent}%`, ...(project.color ? { backgroundColor: project.color } : {}) }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
