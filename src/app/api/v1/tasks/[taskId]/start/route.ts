import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { startTask } from "@/lib/api/task-transitions";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");
  const result = await startTask(guard.userId, taskId, { botLabel: guard.botLabel, keyName: guard.keyName, apiKeyId: guard.apiKeyId, humanClient: guard.humanClient });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  // An agent's lease (task-claims.ts): call start_task again to renew it.
  const claim = result.claim ? { expires_at: result.claim.expires_at, claimed_at: result.claim.claimed_at } : undefined;
  return NextResponse.json({ task: result.task, ...(claim ? { claim } : {}) });
}

export const POST = apiRoute(handlePOST);
