import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { startTask } from "@/lib/api/task-transitions";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { apiDataClient } from "@/lib/api/api-data-client";

/** The newest few: enough to stop a repeat without filling the agent's context. */
const DEAD_END_LIMIT = 5;

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");
  const result = await startTask(guard.userId, taskId, { botLabel: guard.botLabel, keyName: guard.keyName, apiKeyId: guard.apiKeyId, humanClient: guard.humanClient });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  // An agent's lease (task-claims.ts): call start_task again to renew it.
  const claim = result.claim ? { expires_at: result.claim.expires_at, claimed_at: result.claim.claimed_at } : undefined;
  // What was already tried and didn't work, right where the work starts - an
  // agent that skipped get_task_context still sees it before repeating it.
  // Best effort: the task is started either way.
  const { data: deadEnds } = await apiDataClient(guard.userId)
    .from("task_attempts")
    .select("approach, outcome, failure_reason, created_at")
    .eq("task_id", taskId)
    .in("outcome", ["failed", "partial"])
    .order("created_at", { ascending: false })
    .limit(DEAD_END_LIMIT);
  return NextResponse.json({ task: result.task, ...(claim ? { claim } : {}), ...(deadEnds?.length ? { dead_ends: deadEnds } : {}) });
}

export const POST = apiRoute(handlePOST);
