/** Bounded operational snapshot. Labels describe reported agents, not verified identities. */
export type MonitorTask = { id: string; title: string; status: string };
export type MonitorClaim = { task_id: string; holder_key_id: string; holder_label: string | null; claimed_at: string; expires_at: string };
export type MonitorAttempt = { id: string; task_id: string; agent: string | null; outcome: string; created_at: string };
export type MonitorMemory = { id: string; verified: boolean | null; updated_at: string | null };
export type MonitorApproval = { status: string; expires_at: string };

export function monitoringSnapshot(input: {
  tasks: MonitorTask[]; claims: MonitorClaim[]; attempts: MonitorAttempt[];
  memory: MonitorMemory[]; approvals: MonitorApproval[];
}, now = Date.now()) {
  const statuses = new Map<string, number>();
  for (const task of input.tasks) statuses.set(task.status,(statuses.get(task.status) ?? 0)+1);
  const taskIds = new Set(input.tasks.map(task => task.id));
  const agents = new Map<string | null, { label: string | null; tasks: Set<string>; failed: number; partial: number; succeeded: number }>();
  const attemptsPerTask = new Map<string, number>();
  const seenAttempts = new Set<string>();
  for (const attempt of input.attempts) {
    if (!taskIds.has(attempt.task_id) || seenAttempts.has(attempt.id)) continue;
    seenAttempts.add(attempt.id);
    const label = attempt.agent?.trim() || null;
    const agent = agents.get(label) ?? { label, tasks: new Set<string>(), failed: 0, partial: 0, succeeded: 0 };
    agent.tasks.add(attempt.task_id);
    if (attempt.outcome === "failed" || attempt.outcome === "partial" || attempt.outcome === "succeeded") agent[attempt.outcome]++;
    agents.set(label, agent);
    attemptsPerTask.set(attempt.task_id, (attemptsPerTask.get(attempt.task_id) ?? 0) + 1);
  }
  const memories = input.memory.map(row => Date.parse(row.updated_at ?? "")).filter(Number.isFinite);
  return {
    statuses: Object.fromEntries(statuses),
    agents: [...agents.values()].map(agent => ({ ...agent, tasks: agent.tasks.size })).sort((a,b) => b.tasks-a.tasks || (a.label ?? "").localeCompare(b.label ?? "")),
    claims: input.claims.map(claim => ({ ...claim, expired: Date.parse(claim.expires_at) <= now, minutes: Math.max(0, Math.floor((now - Date.parse(claim.claimed_at)) / 60000)) })),
    repeatedAttempts: [...attemptsPerTask.values()].reduce((sum, count) => sum + Math.max(0, count-1), 0),
    pendingApprovals: input.approvals.filter(row => row.status === "pending" && Date.parse(row.expires_at) > now).length,
    latestMemory: memories.length ? new Date(Math.max(...memories)).toISOString() : null,
    unverifiedMemory: input.memory.filter(row => !row.verified).length,
  };
}
