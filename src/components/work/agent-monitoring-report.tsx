import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAgentMonitoring, MONITOR_LIMIT } from "@/lib/data/agent-monitoring";
import { getWorkflowOverrides } from "@/lib/data/workflow";
import { resolveBoardColumns } from "@/lib/work/task-board";

export async function AgentMonitoringReport({ userId, projectId }: { userId: string; projectId: string }) {
  const t = await getTranslations("agentMonitoring");
  const format = await getFormatter();
  let report;
  let columns;
  try { const [snapshot, workflow] = await Promise.all([loadAgentMonitoring(userId,projectId),getWorkflowOverrides(userId,projectId)]); report=snapshot; columns=resolveBoardColumns(workflow.columns); }
  catch { return <p role="alert" className="rounded-xl border border-destructive p-4">{t("error")}</p>; }
  const taskNames = new Map(report.tasks.map(task=>[task.id,task.title]));
  const date = (value:string) => format.dateTime(new Date(value),{dateStyle:"medium",timeStyle:"short"});
  const stats = [["review",report.statuses.review??0],["repeats",report.repeatedAttempts],["approvals",report.pendingApprovals],["unverified",report.unverifiedMemory]] as const;
  return <section aria-labelledby="agent-monitoring-title" className="space-y-6" data-agent-monitoring>
    <div className="space-y-2">
      <h2 id="agent-monitoring-title" className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("scope",{limit:MONITOR_LIMIT})}</p>
      <p className="text-xs text-muted-foreground">{t("generated",{date:date(report.generatedAt)})}</p>
      {report.truncated && <p role="status" className="text-sm text-warning">{t("truncated")}</p>}
    </div>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(([key,value])=><div key={key} className="rounded-xl border bg-card p-4"><dt className="text-sm text-muted-foreground">{t(key)}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    <Card><CardHeader><CardTitle>{t("statuses")}</CardTitle></CardHeader><CardContent>
      {report.tasks.length ? <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">{Object.entries(report.statuses).map(([status,count])=><div key={status}><dt className="break-words text-sm text-muted-foreground">{columns.find(column=>column.status===status)?.label??status}</dt><dd className="font-semibold tabular-nums">{count}</dd></div>)}</dl> : <p>{t("empty")}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("claims")}</CardTitle></CardHeader><CardContent>
      {report.claims.length ? <ul className="divide-y">{report.claims.map(claim=><li key={claim.task_id} className="space-y-1 py-3">
        <Link className="block break-words font-medium underline underline-offset-4" href={`/projects/${projectId}/work?openTask=${claim.task_id}`}>{taskNames.get(claim.task_id)??claim.task_id}</Link>
        <p className="break-words text-sm">{claim.holder_label||t("unknown")} · {t("leaseAge",{minutes:claim.minutes})} · {claim.expired?t("expired"):t("active")}</p>
        <p className="text-xs text-muted-foreground">{t("expires",{date:date(claim.expires_at)})}</p>
      </li>)}</ul> : <p>{t("empty")}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("attempts")}</CardTitle></CardHeader><CardContent>
      <p className="mb-4 text-sm text-muted-foreground">{t("reportedLabels")}</p>
      {report.agents.length ? <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("attempts")}><table className="w-full text-left text-sm"><thead><tr className="border-b [&>th]:px-3 [&>th]:py-2"><th>{t("agent")}</th><th>{t("tasks")}</th><th>{t("succeeded")}</th><th>{t("partial")}</th><th>{t("failed")}</th></tr></thead><tbody>{report.agents.map(agent=><tr key={JSON.stringify(agent.label)} className="border-b [&>td]:px-3 [&>td]:py-2"><td className="max-w-64 break-words">{agent.label??t("unknown")}</td><td>{agent.tasks}</td><td>{agent.succeeded}</td><td>{agent.partial}</td><td>{agent.failed}</td></tr>)}</tbody></table></div> : <p>{t("empty")}</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("memory")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>{report.latestMemory?t("memoryUpdated",{date:date(report.latestMemory)}):t("empty")}</p>
      <p className="text-muted-foreground">{t("unavailable")}</p>
    </CardContent></Card>
  </section>;
}
