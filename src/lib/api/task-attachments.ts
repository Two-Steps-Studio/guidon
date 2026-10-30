import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { agentGate } from "@/lib/api/agent-gate";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";

export const ATTACHMENT_METADATA_COLUMNS = "id, task_id, name, size_bytes, mime_type, created_at";
export type AttachmentMetadata = { id: string; task_id: string; name: string; size_bytes: number | null; mime_type: string | null; created_at: string };

/** The task/project pair is checked before storage's privileged provider is used. */
export async function authorizeTaskAttachments(request: NextRequest, projectId: string, taskId: string) {
  const guard = await guardApiRequest(request, "tasks:read", { projectId });
  if (isGuardError(guard)) return { error: guard } as const;
  for (const [key, value] of Object.entries({ projectId, taskId })) if (!isValidUuid(value)) return { error: invalidIdResponse(key) } as const;
  const db = apiDataClient(guard.userId);
  const { data: task, error } = await db.from<{ id: string }>("tasks").select("id").eq("id", taskId).eq("project_id", projectId).maybeSingle();
  if (error) return { error: NextResponse.json({ error: "Could not load task." }, { status: 500 }) } as const;
  if (!task) return { error: NextResponse.json({ error: "Task not found." }, { status: 404 }) } as const;
  const blocked = await agentGate(db, guard, projectId, "can_read_context");
  if (blocked) return { error: blocked } as const;
  return { db } as const;
}
