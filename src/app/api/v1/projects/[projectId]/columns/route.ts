import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { getWorkflowOverrides } from "@/lib/data/workflow";
import { resolveBoardColumns } from "@/lib/work/task-board";

/**
 * The project's board columns as the web board shows them - built-in ones
 * with the project's label/order/visibility overrides (migration 020) plus
 * its own columns (060), in board order, hidden ones left out. Each has
 * `status` (the key tasks carry), `label`, `is_done` (tasks there count as
 * finished), `custom` and `color` (hex or null). Labels are the English
 * defaults unless the project saved its own (the API has no locale).
 *
 * `tasks:read`-gated like the tasks list; a project the key's user can't see
 * is 404, same as there.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  const db = apiDataClient(guard.userId);
  const { data: project, error } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const workflow = await getWorkflowOverrides(guard.userId, projectId, db);
  const columns = resolveBoardColumns(workflow.columns).map((column) => ({
    status: column.status,
    label: column.label,
    is_done: column.isDone,
    custom: column.custom,
    color: column.color ?? null,
  }));
  return NextResponse.json({ columns });
}
