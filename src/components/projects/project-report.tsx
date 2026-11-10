import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RollingNumber } from "@/components/ui/rolling-number";

/** What public.project_report() (migration 123) returns. */
export interface ProjectReportData {
  open: number;
  overdue: number;
  unassigned: number;
  finished_per_week: { week_start: string; finished: number }[];
  workload: { assignee_id: string; name: string | null; avatar_url: string | null; open: number; overdue: number; finished_30d: number }[];
}

/** Project overview: finished tasks per week and who has how much open work. */
export async function ProjectReport({ report }: { report: ProjectReportData }) {
  const t = await getTranslations("projects.detail");
  const format = await getFormatter();
  const weeks = report.finished_per_week;
  const max = Math.max(1, ...weeks.map((w) => w.finished));
  const total = weeks.reduce((sum, w) => sum + w.finished, 0);

  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("reportFinishedTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("reportFinishedSummary", { count: total, weeks: weeks.length })}</p>
        </CardHeader>
        <CardContent>
          <ol className="flex h-36 items-end gap-1 sm:gap-2" aria-label={t("reportFinishedTitle")}>
            {weeks.map((w) => {
              const label = format.dateTime(new Date(`${w.week_start}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
              return (
                <li key={w.week_start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>{w.finished ? <RollingNumber value={w.finished} /> : ""}</span>
                  <div
                    className="w-full rounded-t-sm bg-primary/80"
                    style={{ height: `${(w.finished / max) * 100}%`, minHeight: w.finished ? 4 : 1 }}
                    aria-hidden
                  />
                  <span className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground sm:text-[11px]" aria-hidden>{label}</span>
                  <span className="sr-only">{t("reportWeekItem", { week: label, count: w.finished })}</span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("reportWorkloadTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("reportOpenSummary", { open: report.open, overdue: report.overdue, unassigned: report.unassigned })}
          </p>
        </CardHeader>
        <CardContent>
          {report.workload.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reportWorkloadEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1.5 pr-2 font-medium">{t("reportPerson")}</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-medium">{t("reportOpen")}</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-medium">{t("reportOverdue")}</th>
                    <th scope="col" className="py-1.5 pl-2 text-right font-medium">{t("reportFinished30")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.workload.map((row) => (
                    <tr key={row.assignee_id} className="border-t border-border">
                      <td className="py-2 pr-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarImage src={row.avatar_url ?? undefined} alt="" />
                            <AvatarFallback className="text-[10px]">{(row.name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{row.name ?? t("reportUnknownPerson")}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums"><RollingNumber value={row.open} /></td>
                      <td className={`px-2 py-2 text-right tabular-nums ${row.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}><RollingNumber value={row.overdue} /></td>
                      <td className="py-2 pl-2 text-right tabular-nums"><RollingNumber value={row.finished_30d} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
