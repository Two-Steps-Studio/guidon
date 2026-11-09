import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { completeTask } from "@/lib/api/task-transitions";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { apiDataClient } from "@/lib/api/api-data-client";
import { missingAttemptReminder, ownClaimStart } from "@/lib/api/attempt-reminder";

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:status");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");
  // Read before completing: it releases the claim.
  const db = apiDataClient(guard.userId);
  const claimStart = await ownClaimStart(db, taskId, guard.apiKeyId);
  const result = await completeTask(guard.userId, taskId, { botLabel: guard.botLabel, keyName: guard.keyName, apiKeyId: guard.apiKeyId, humanClient: guard.humanClient });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const reminder = claimStart ? await missingAttemptReminder(db, taskId, claimStart) : null;
  return NextResponse.json({ task: result.task, ...(reminder ? { reminder } : {}) });
}

export const POST = apiRoute(handlePOST);
