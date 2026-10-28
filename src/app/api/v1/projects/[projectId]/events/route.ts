import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { parseLimit } from "@/lib/api/api-route-core";
import { apiRoute } from "@/lib/api/api-route";
import { agentGate } from "@/lib/api/agent-gate";

const MAX_LIMIT = 500;

/**
 * The project's event log (migration 090), oldest first: tasks, comments,
 * decisions, knowledge sources, files, AI agent attempts and GitHub events,
 * captured by database triggers in the same transaction as the change.
 * Payloads hold references only (ids, field names, statuses) - fetch the
 * entity itself for its content.
 *
 * `?after=<seq>` resumes after the last event a consumer processed, so
 * replay is "start from 0" and catching up is "pass the last seq". `cursor`
 * in the answer is the seq to pass next (unchanged when there is nothing
 * new). Events of transactions still running are held back until they end,
 * so a reader never moves past an event that commits later with a lower seq.
 * `dedupe_key` is unique per organization: a consumer can store it to
 * process each event once.
 *
 * `project:read`-gated like decisions/knowledge; a project the key's user
 * can't see is 404.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");
  const guard = await guardApiRequest(request, "project:read", { projectId });
  if (isGuardError(guard)) return guard;

  const url = new URL(request.url);
  const afterParam = url.searchParams.get("after");
  if (afterParam !== null && !/^\d{1,15}$/.test(afterParam)) {
    return NextResponse.json({ error: "`after` must be the seq of an event (a non-negative integer)." }, { status: 400 });
  }
  const after = Number(afterParam ?? 0);
  const limit = parseLimit(url.searchParams.get("limit"), 100, MAX_LIMIT);

  const db = apiDataClient(guard.userId);
  const { data: project, error: projectError } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const blocked = await agentGate(db, guard, projectId, "can_read_context");
  if (blocked) return blocked;

  const { data, error } = await db.rpcRows("list_context_events", {
    p_project_id: projectId,
    p_after_seq: after,
    p_limit: limit + 1,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = data ?? [];
  // int8 arrives as a string from pg and as a number from PostgREST.
  const events = rows.slice(0, limit).map((row) => ({ ...row, seq: Number(row.seq) }));
  return NextResponse.json({
    events,
    cursor: events.length ? events[events.length - 1].seq : after,
    has_more: rows.length > limit,
  });
}

export const GET = apiRoute(handleGET);
