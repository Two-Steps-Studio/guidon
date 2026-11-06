import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { ADMIN_QUEUES } from "@/lib/admin/operations-queues";
import { requeueFailedJob } from "./actions";

export default async function AdminOperations({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  await requireAdminAccess("operations.manage");
  const db = serviceDataClient();
  const now = new Date();
  const [queues, reports, { result }] = await Promise.all([
    Promise.all(Object.entries(ADMIN_QUEUES).map(async ([name, table]) => {
      const [pending, due, failed, jobs, oldest] = await Promise.all([
        db.from(table).eq("status", "pending").count(),
        db.from(table).eq("status", "pending").lte("next_attempt_at", now.toISOString()).count(),
        db.from(table).eq("status", "failed").count(),
        db.from<{ id: string; attempts: number; updated_at: string }>(table)
          .select("id, attempts, updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(20),
        db.from<{ next_attempt_at: string }>(table).select("next_attempt_at").eq("status", "pending")
          .lte("next_attempt_at", now.toISOString()).order("next_attempt_at").limit(1).maybeSingle(),
      ]);
      if (pending.error || due.error || failed.error || jobs.error || oldest.error) throw new Error("Could not load queue metrics");
      const oldestDueSeconds = oldest.data ? Math.max(0, Math.floor((now.getTime() - new Date(oldest.data.next_attempt_at).getTime()) / 1000)) : 0;
      return { name, pending: pending.data, due: due.data, failed: failed.data, jobs: jobs.data, oldestDueSeconds };
    })),
    db.from("module_reports").eq("status", "open").count(),
    searchParams,
  ]);
  if (reports.error) throw new Error("Could not load open report count");
  return <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
    <h2 className="text-2xl font-bold">Operations</h2>
    <p><Link href="/admin/modules#open-reports" className="underline">Open abuse reports</Link> · {reports.data}</p>
    {result === "queued" && <p role="status">Retry scheduled.</p>}
    {result === "failed" && <p role="alert">The retry could not be scheduled.</p>}
    {queues.map(queue => <section key={queue.name} className="space-y-2 rounded-xl border p-4">
      <h3 className="text-lg font-semibold capitalize">{queue.name}</h3>
      <dl className="grid gap-2 sm:grid-cols-4">
        <div><dt>Pending</dt><dd>{queue.pending}</dd></div>
        <div><dt>Due</dt><dd>{queue.due}</dd></div>
        <div><dt>Failed</dt><dd>{queue.failed}</dd></div>
        <div><dt>Oldest due</dt><dd>{queue.oldestDueSeconds} s</dd></div>
      </dl>
      <ul className="divide-y">{queue.jobs.map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span className="break-all">{job.id} · {job.attempts} attempts</span>
        <form action={requeueFailedJob}>
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="queue" value={queue.name} />
          <Button type="submit" size="sm" variant="outline" disabled={job.attempts >= 20}>Schedule retry</Button>
        </form>
      </li>)}</ul>
    </section>)}
  </div>;
}
