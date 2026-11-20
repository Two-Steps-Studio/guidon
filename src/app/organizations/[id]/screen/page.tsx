import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgAccess } from "@/lib/data/org-access";
import { dataClient } from "@/lib/data-client";
import { cn } from "@/lib/utils";
import { ScreenRefresh } from "./screen-refresh";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Projects and finished tasks a wall screen has room for. */
const PROJECTS_SHOWN = 12;
const RECENT_DONE = 8;

interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
}

interface DoneRow {
  id: string;
  title: string;
  project_id: string;
  done_at: string | null;
}

/**
 * The organization on a wall screen or TV: big, read-only numbers that keep
 * themselves current (ScreenRefresh re-renders every minute), so nobody has
 * to click anything. Every read goes through the data client as the signed-in
 * member, so RLS decides what the screen may show.
 */
export default async function OrganizationScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const [access, t, locale] = await Promise.all([requireOrgAccess(orgId), getTranslations("organizations.screen"), getLocale()]);
  const db = dataClient(access.userId);

  const projectsRes = await db
    .from<ProjectRow>("projects")
    .select("id, name, color")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(PROJECTS_SHOWN);
  if (projectsRes.error) throw new Error(`Failed to load the screen: ${projectsRes.error.message}`);
  const projects = projectsRes.data;
  const ids = projects.map((project) => project.id);

  const { today, weekAgo } = timeBounds();
  const topLevel = () => db.from("tasks").in("project_id", ids).is("parent_task_id", null);

  const [openRes, inProgressRes, reviewRes, overdueRes, doneWeekRes, recentRes, ...perProject] = ids.length
    ? await Promise.all([
        topLevel().eq("is_done", false).count(),
        topLevel().in("status", ["in_progress", "ai_working"]).count(),
        topLevel().eq("status", "review").count(),
        topLevel().eq("is_done", false).lt("due_date", today).count(),
        topLevel().eq("is_done", true).gte("done_at", weekAgo).count(),
        db
          .from<DoneRow>("tasks")
          .select("id, title, project_id, done_at")
          .in("project_id", ids)
          .eq("is_done", true)
          .order("done_at", { ascending: false, nullsFirst: false })
          .limit(RECENT_DONE),
        ...projects.flatMap((project) => [
          db.from("tasks").eq("project_id", project.id).is("parent_task_id", null).count(),
          db.from("tasks").eq("project_id", project.id).is("parent_task_id", null).eq("is_done", true).count(),
        ]),
      ])
    : [];
  const count = (result: { data: unknown } | undefined) => Number(result?.data ?? 0);
  const recent = ((recentRes?.data ?? []) as DoneRow[]).filter((task) => task.done_at);
  const projectName = new Map(projects.map((project) => [project.id, project]));

  const tiles = [
    { label: t("open"), value: count(openRes) },
    { label: t("inProgress"), value: count(inProgressRes) },
    { label: t("review"), value: count(reviewRes) },
    { label: t("overdue"), value: count(overdueRes), alert: count(overdueRes) > 0 },
    { label: t("doneWeek"), value: count(doneWeekRes), good: true },
  ];

  return (
    <main className="min-h-dvh bg-background p-6 text-foreground lg:p-10">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="truncate text-4xl font-bold lg:text-5xl">{access.organization.name}</h1>
        </div>
        <ScreenRefresh updatedAt={renderedAt()} locale={locale} updatedLabel={t.raw("updated") as string} />
      </header>

      <section aria-label={t("summary")} className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-border bg-card p-6">
            <p className="text-lg text-muted-foreground">{tile.label}</p>
            <p className={cn("mt-2 text-6xl font-bold tabular-nums", tile.alert && "text-destructive", tile.good && "text-success")}>{tile.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
        <section aria-labelledby="screen-projects">
          <h2 id="screen-projects" className="mb-4 text-2xl font-semibold">{t("projects")}</h2>
          {projects.length === 0 ? (
            <p className="text-lg text-muted-foreground">{t("noProjects")}</p>
          ) : (
            <ul className="space-y-4">
              {projects.map((project, index) => {
                const total = count(perProject[index * 2]);
                const done = count(perProject[index * 2 + 1]);
                const percent = total ? Math.round((done / total) * 100) : 0;
                return (
                  <li key={project.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-4 text-lg">
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className="size-3 shrink-0 rounded-full bg-primary" style={project.color ? { backgroundColor: project.color } : undefined} />
                        <span className="truncate font-medium">{project.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{t("progress", { done, total, percent })}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={project.name}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%`, ...(project.color ? { backgroundColor: project.color } : {}) }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="screen-recent">
          <h2 id="screen-recent" className="mb-4 text-2xl font-semibold">{t("recentlyDone")}</h2>
          {recent.length === 0 ? (
            <p className="text-lg text-muted-foreground">{t("nothingDone")}</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((task) => (
                <li key={task.id} className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="truncate text-lg font-medium">{task.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{projectName.get(task.project_id)?.name}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/** When this render read the numbers (shown as "Updated hh:mm"). */
function renderedAt(): number {
  return Date.now();
}

/** Start of today (UTC, as the dashboard counts overdue) and a week ago, for the counts. */
function timeBounds(): { today: string; weekAgo: string } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return { today: today.toISOString(), weekAgo: new Date(Date.now() - 7 * 86_400_000).toISOString() };
}
