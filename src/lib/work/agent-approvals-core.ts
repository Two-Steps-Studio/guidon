/**
 * Agents asking for approval (agent_approval_requests, migration 102): an
 * agent whose AI permissions don't allow completing or deleting a task asks,
 * and a project owner/admin approves or rejects in the project's Approvals
 * inbox. The action then runs as that person. Pure - no server imports - so
 * tests/app-changes.test.mjs runs it directly.
 */

export const APPROVAL_ACTIONS = ["complete_task", "delete_task"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired", "failed"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_TEXT_MAX = 2000;

export type ApprovalRequest = {
  id: string;
  project_id: string;
  task_id: string | null;
  action: ApprovalAction;
  reason: string | null;
  snapshot: { title?: string; status?: string };
  requested_by: string;
  app_name: string | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_comment: string | null;
  created_at: string;
  expires_at: string;
};

export const APPROVAL_COLUMNS =
  "id, project_id, task_id, action, reason, snapshot, requested_by, app_name, status, decided_by, decided_at, decision_comment, created_at, expires_at";

/** The body of POST /api/v1/tasks/:id/approval-requests. */
export function parseApprovalRequestBody(body: unknown): { action: ApprovalAction; reason: string | null } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be a JSON object." };
  const { action, reason } = body as Record<string, unknown>;
  if (typeof action !== "string" || !(APPROVAL_ACTIONS as readonly string[]).includes(action)) {
    return { error: `action must be one of: ${APPROVAL_ACTIONS.join(", ")}.` };
  }
  if (reason !== undefined && reason !== null && typeof reason !== "string") return { error: "reason must be a string." };
  if (typeof reason === "string" && reason.length > APPROVAL_TEXT_MAX) {
    return { error: `reason must be at most ${APPROVAL_TEXT_MAX} characters.` };
  }
  return { action: action as ApprovalAction, reason: typeof reason === "string" ? reason.trim() || null : null };
}

/** A pending request past its expiry reads as expired even before anything rewrites the row. */
export function effectiveStatus(request: Pick<ApprovalRequest, "status" | "expires_at">, now: Date = new Date()): ApprovalStatus {
  return request.status === "pending" && new Date(request.expires_at).getTime() <= now.getTime() ? "expired" : request.status;
}

/** Waiting ones first, the one that expires soonest on top; then decided ones, newest first. */
export function sortInbox<T extends Pick<ApprovalRequest, "status" | "expires_at" | "created_at">>(requests: T[], now: Date = new Date()): T[] {
  const waiting = (request: T) => effectiveStatus(request, now) === "pending";
  return [...requests].sort((a, b) => {
    if (waiting(a) !== waiting(b)) return waiting(a) ? -1 : 1;
    if (waiting(a)) return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/** Why the database refused a decision (public.decide_agent_approval raises these). */
export type DecisionRefusal = "already_decided" | "expired" | "task_gone" | "forbidden" | "unknown";

export function decisionRefusal(message: string | undefined): DecisionRefusal {
  if (!message) return "unknown";
  if (/already decided/i.test(message)) return "already_decided";
  if (/expired/i.test(message)) return "expired";
  if (/no longer exists/i.test(message)) return "task_gone";
  if (/owners and admins|permission denied|42501/i.test(message)) return "forbidden";
  return "unknown";
}
