import "server-only";

import { dataClient } from "@/lib/data-client";
import { APPROVAL_COLUMNS, effectiveStatus, sortInbox, type ApprovalRequest } from "@/lib/work/agent-approvals-core";

/**
 * For the project nav: null when no agent has ever asked for approval here
 * (the Approvals link stays hidden, so a team without AI never sees it),
 * else how many requests are waiting.
 */
export async function approvalSummary(userId: string, projectId: string): Promise<{ pending: number } | null> {
  const { data, error } = await dataClient(userId)
    .from<Pick<ApprovalRequest, "status" | "expires_at">>("agent_approval_requests")
    .select("status, expires_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || data.length === 0) return null;
  return { pending: data.filter((row) => effectiveStatus(row) === "pending").length };
}

/** The inbox: waiting requests first (soonest to expire on top), then the history. */
export async function listApprovalRequests(userId: string, projectId: string): Promise<ApprovalRequest[]> {
  const { data, error } = await dataClient(userId)
    .from<ApprovalRequest>("agent_approval_requests")
    .select(APPROVAL_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to load approval requests: ${error.message}`);
  return sortInbox(data.map((row) => ({ ...row, status: effectiveStatus(row) })));
}
