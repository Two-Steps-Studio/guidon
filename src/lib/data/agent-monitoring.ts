import "server-only";
import { dataClient } from "@/lib/data-client";
import { monitoringSnapshot, type MonitorTask, type MonitorClaim, type MonitorAttempt, type MonitorMemory, type MonitorApproval } from "@/lib/work/agent-monitoring-core";

export const MONITOR_LIMIT = 200;

/** Every query runs as the caller under existing RLS; no privileged analytics client. */
export async function loadAgentMonitoring(userId: string, projectId: string) {
  const db = dataClient(userId);
  const [tasks, claims, memory, approvals] = await Promise.all([
    db.from<MonitorTask>("tasks").select("id, title, status").eq("project_id",projectId).order("updated_at",{ascending:false,nullsFirst:false}).order("id").limit(MONITOR_LIMIT+1),
    db.from<MonitorClaim>("task_claims").select("task_id, holder_key_id, holder_label, claimed_at, expires_at").eq("project_id",projectId).order("claimed_at",{ascending:false}).order("task_id").limit(MONITOR_LIMIT+1),
    db.from<MonitorMemory>("project_memory").select("id, verified, updated_at").eq("project_id",projectId).order("updated_at",{ascending:false,nullsFirst:false}).order("id").limit(MONITOR_LIMIT+1),
    db.from<MonitorApproval>("agent_approval_requests").select("status, expires_at").eq("project_id",projectId).order("created_at",{ascending:false}).order("id").limit(MONITOR_LIMIT+1),
  ]);
  if ([tasks,claims,memory,approvals].some(result => result.error)) throw new Error("Monitoring data unavailable");
  const selectedTasks = tasks.data.slice(0,MONITOR_LIMIT);
  const attempts: MonitorAttempt[] = [];
  let truncated = [tasks,claims,memory,approvals].some(result => result.data.length > MONITOR_LIMIT);
  // Keep Supabase URLs bounded; every task id came from this project's RLS-scoped query.
  for (let offset=0;offset<selectedTasks.length;offset+=50) {
    const result = await db.from<MonitorAttempt>("task_attempts").select("id, task_id, agent, outcome, created_at")
      .in("task_id",selectedTasks.slice(offset,offset+50).map(task=>task.id))
      .order("created_at",{ascending:false}).order("id").limit(MONITOR_LIMIT+1);
    if (result.error) throw new Error("Monitoring attempts unavailable");
    truncated ||= result.data.length > MONITOR_LIMIT;
    attempts.push(...result.data.slice(0,MONITOR_LIMIT));
  }
  const now = Date.now();
  return { ...monitoringSnapshot({tasks:selectedTasks,claims:claims.data.slice(0,MONITOR_LIMIT),memory:memory.data.slice(0,MONITOR_LIMIT),approvals:approvals.data.slice(0,MONITOR_LIMIT),attempts},now), tasks:selectedTasks, truncated, generatedAt:new Date(now).toISOString() };
}
