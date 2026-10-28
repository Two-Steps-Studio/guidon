"use server";

import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/api/validate-id";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { tr } from "@/lib/i18n/server-errors";
import { APPROVAL_TEXT_MAX, decisionRefusal, type ApprovalRequest } from "@/lib/work/agent-approvals-core";
import { deleteTask, moveTask } from "../work/actions";

const SORT_STEP = 1000;

async function refusalMessage(message: string | undefined): Promise<string> {
  switch (decisionRefusal(message)) {
    case "already_decided":
      return tr("Someone already decided this request.");
    case "expired":
      return tr("This request expired. The agent can ask again.");
    case "task_gone":
      return tr("The task no longer exists, so there is nothing to approve.");
    case "forbidden":
      return tr("Only project owners and admins can approve or reject requests.");
    default:
      return tr("This request could not be decided.");
  }
}

/**
 * Approves or rejects an agent's request (owner/admin). The decision is
 * written first - public.decide_agent_approval locks the row and only takes
 * a pending, unexpired request - so a rejection, or a second person deciding
 * at the same moment, never runs anything. An approved action then runs as
 * the person through the board's own actions (same checks, activity log,
 * webhooks); if it fails, the request is marked failed with the reason
 * instead of pretending it happened.
 */
export async function decideApproval(
  projectId: string,
  requestId: string,
  approve: boolean,
  comment: string
): Promise<{ error: string | null; request?: ApprovalRequest }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: await tr("Only project owners and admins can approve or reject requests.") };
  }
  if (!isValidUuid(requestId)) return { error: await tr("This request could not be decided.") };
  if (comment.length > APPROVAL_TEXT_MAX) return { error: await tr("The comment is too long.") };

  const db = dataClient(access.userId);
  // Scoped to this project: the function itself checks the caller's role on
  // the request's own project, this keeps a request id from another project
  // from being decided through this page.
  const { data: owned } = await db
    .from<{ id: string }>("agent_approval_requests")
    .select("id")
    .eq("id", requestId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!owned) return { error: await tr("This request could not be decided.") };

  const { data: rows, error } = await db.rpcRows<ApprovalRequest>("decide_agent_approval", {
    p_id: requestId,
    p_approve: approve,
    p_comment: comment,
  });
  if (error || !rows[0]) {
    revalidatePath(`/projects/${projectId}/approvals`);
    return { error: await refusalMessage(error?.message) };
  }
  const decided = rows[0];

  if (approve && decided.task_id) {
    let failure: string | null = null;
    if (decided.action === "delete_task") {
      failure = (await deleteTask(projectId, decided.task_id)).error;
    } else {
      const { data: last } = await db
        .from<{ sort_order: number }>("tasks")
        .select("sort_order")
        .eq("project_id", projectId)
        .eq("status", "done")
        .is("parent_task_id", null)
        .order("sort_order", { ascending: false })
        .limit(1);
      failure = (await moveTask(projectId, decided.task_id, "done", (last[0]?.sort_order ?? 0) + SORT_STEP)).error;
    }
    if (failure) {
      await db.rpc("mark_agent_approval_failed", { p_id: requestId, p_error: failure });
      revalidatePath(`/projects/${projectId}/approvals`);
      return { error: failure, request: { ...decided, status: "failed" } };
    }
  }

  revalidatePath(`/projects/${projectId}/approvals`);
  revalidatePath(`/projects/${projectId}/work`);
  return { error: null, request: decided };
}
