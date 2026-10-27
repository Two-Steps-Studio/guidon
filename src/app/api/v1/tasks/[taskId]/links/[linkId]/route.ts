import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { reviewTaskLink } from "@/lib/data/task-links";

const reviewBody = z.strictObject({ decision: z.enum(["confirm", "reject"]) });

/**
 * Review a task link: `confirm` a suggestion (or restore a rejected link),
 * `reject` a link that isn't related. `tasks:write`; owner/admin/developer
 * under RLS. The decision and who made it are kept and logged as a
 * context event (task.link_confirmed / task.link_rejected).
 */
async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string; linkId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;
  const { taskId, linkId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");
  if (!isValidUuid(linkId)) return invalidIdResponse("linkId");
  const parsed = reviewBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send {\"decision\": \"confirm\" | \"reject\"}." }, { status: 400 });
  const db = apiDataClient(guard.userId);
  const { data: task } = await db.from<{ project_id: string }>("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const result = await reviewTaskLink(db, guard.userId, task.project_id, linkId, parsed.data.decision, taskId);
  if (result.error === "not_found") return NextResponse.json({ error: "Link not found, or you can't review links in this project." }, { status: 404 });
  if (result.error || !result.link) return NextResponse.json({ error: "Could not update the link." }, { status: 500 });
  return NextResponse.json({ link: result.link });
}

export const PATCH = apiRoute(handlePATCH);
