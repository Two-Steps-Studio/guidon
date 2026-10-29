import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isPermissionDenied } from "@/lib/db/errors";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { createNotification } from "@/lib/data/notifications";
import {
  APPROVAL_COLUMNS,
  effectiveStatus,
  parseApprovalRequestBody,
  type ApprovalRequest,
} from "@/lib/work/agent-approvals-core";

const ACTION_LABEL = { complete_task: "complete", delete_task: "delete" } as const;

/** A task's approval requests, newest first, with expired ones reported as expired (`tasks:read`). */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const { data, error } = await apiDataClient(guard.userId)
    .from<ApprovalRequest>("agent_approval_requests")
    .select(APPROVAL_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ requests: data.map((row) => ({ ...row, status: effectiveStatus(row) })) });
}

/**
 * Asks the project's owners/admins for an action this key isn't allowed to
 * take itself - `complete_task` or `delete_task` (`tasks:write`). Nothing
 * changes until a person approves it in the project's Approvals inbox; the
 * action then runs as them. One pending request per task and action:
 * asking again returns it (`created: false`) and notifies nobody again.
 * public.request_agent_approval (102) checks the role and the key.
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const parsed = parseApprovalRequestBody(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = apiDataClient(guard.userId);
  const { data: rows, error } = await db.rpcRows<{ id: string; created: boolean }>("request_agent_approval", {
    p_task_id: taskId,
    p_action: parsed.action,
    p_reason: parsed.reason,
    p_key_id: guard.apiKeyId,
    p_app_name: guard.botLabel ?? guard.keyName,
  });
  if (error) {
    if (isPermissionDenied(error)) {
      return NextResponse.json({ error: "You cannot ask for approval on this task." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const result = rows[0];
  if (!result) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: saved } = await db
    .from<ApprovalRequest>("agent_approval_requests")
    .select(APPROVAL_COLUMNS)
    .eq("id", result.id)
    .maybeSingle();
  if (!saved) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  if (result.created) {
    const { data: managers } = await db
      .from<{ user_id: string }>("project_members")
      .select("user_id")
      .eq("project_id", saved.project_id)
      .in("role", ["owner", "admin"]);
    const app = saved.app_name ?? "An app";
    const title = `${app} asks to ${ACTION_LABEL[saved.action]} "${saved.snapshot.title ?? "a task"}"`.slice(0, 200);
    // The key's own owner too: their agent asked, not them.
    for (const manager of managers ?? []) {
      await createNotification({
        userId: manager.user_id,
        projectId: saved.project_id,
        type: "agent_approval",
        title,
        body: saved.reason?.slice(0, 1000) ?? null,
        link: `/projects/${saved.project_id}/approvals`,
      });
    }
  }

  return NextResponse.json({ request: saved, created: result.created }, { status: result.created ? 201 : 200 });
}

export const GET = apiRoute(handleGET);
export const POST = apiRoute(handlePOST);
