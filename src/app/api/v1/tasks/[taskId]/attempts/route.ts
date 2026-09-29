import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isPermissionDenied } from "@/lib/db/errors";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { isSafeHttpUrl } from "@/lib/validation/url";
import {
  ATTEMPT_FILES_MAX,
  ATTEMPT_FILE_PATH_MAX,
  ATTEMPT_PR_URL_MAX,
  ATTEMPT_TEXT_MAX,
} from "@/lib/api/attempt-limits";

// Same column set as loadAttempts/createAttempt in
// src/app/projects/[id]/work/attempts-actions.ts (Previous Attempts, migration 013).
const ATTEMPT_COLUMNS =
  "id, task_id, problem, approach, outcome, result, failure_reason, files_changed, related_pr_url, agent, created_by, created_at";

const OUTCOMES = ["failed", "partial", "succeeded"] as const;
type AttemptOutcome = (typeof OUTCOMES)[number];

const FORBIDDEN_MESSAGE = "You do not have permission to record an attempt on this task.";

/**
 * Lists a task's recorded attempts, newest first (`tasks:read`). Mirrors
 * loadAttempts in src/app/projects/[id]/work/attempts-actions.ts.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const db = apiDataClient(guard.userId);

  const { data: task } = await db.from("tasks").select("id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data, error } = await db
    .from("task_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ attempts: data });
}

/**
 * Records a Previous Attempt on a task (`attempts:write`). Mirrors
 * createAttempt in src/app/projects/[id]/work/attempts-actions.ts: `problem` and
 * `approach` required, `outcome` one of failed/partial/succeeded,
 * `related_pr_url` must be http(s), `files_changed` an array of strings.
 * `agent` is taken from the request body (or null) - deliberately NOT
 * defaulted from the key's bot label.
 *
 * The real gate is task_attempts_insert (migration 013, project role
 * owner/admin/developer): a WITH CHECK violation on INSERT throws (42501)
 * rather than filtering rows, so it is mapped to 403 below.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const guard = await guardApiRequest(request, "attempts:write");
  if (isGuardError(guard)) return guard;

  const { taskId } = await params;
  if (!isValidUuid(taskId)) return invalidIdResponse("taskId");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;

  // Optional text fields: absent/null -> null, wrong type -> 400, blank -> null
  // (same `trim() || null` normalisation as createAttempt).
  const optionalText = (field: string, max: number): { value: string | null } | { error: string } => {
    const raw = fields[field];
    if (raw === undefined || raw === null) return { value: null };
    if (typeof raw !== "string") return { error: `${field} must be a string.` };
    if (raw.length > max) return { error: `${field} must be at most ${max} characters.` };
    return { value: raw.trim() || null };
  };

  const problem = typeof fields.problem === "string" ? fields.problem.trim() : "";
  const approach = typeof fields.approach === "string" ? fields.approach.trim() : "";
  if (!problem || !approach) {
    return NextResponse.json({ error: "problem and approach are required." }, { status: 400 });
  }
  for (const field of ["problem", "approach"] as const) {
    if ((fields[field] as string).length > ATTEMPT_TEXT_MAX) {
      return NextResponse.json({ error: `${field} must be at most ${ATTEMPT_TEXT_MAX} characters.` }, { status: 400 });
    }
  }

  if (typeof fields.outcome !== "string" || !OUTCOMES.includes(fields.outcome as AttemptOutcome)) {
    return NextResponse.json({ error: `outcome must be one of: ${OUTCOMES.join(", ")}.` }, { status: 400 });
  }
  const outcome = fields.outcome as AttemptOutcome;

  const parsed = {
    result: optionalText("result", ATTEMPT_TEXT_MAX),
    failure_reason: optionalText("failure_reason", ATTEMPT_TEXT_MAX),
    related_pr_url: optionalText("related_pr_url", ATTEMPT_PR_URL_MAX),
    agent: optionalText("agent", ATTEMPT_TEXT_MAX),
  };
  for (const field of Object.values(parsed)) {
    if ("error" in field) return NextResponse.json({ error: field.error }, { status: 400 });
  }
  const values = {
    result: (parsed.result as { value: string | null }).value,
    failure_reason: (parsed.failure_reason as { value: string | null }).value,
    related_pr_url: (parsed.related_pr_url as { value: string | null }).value,
    agent: (parsed.agent as { value: string | null }).value,
  };

  // Rendered straight into an <a href> for every project member - see
  // src/lib/validation/url.ts.
  if (values.related_pr_url && !isSafeHttpUrl(values.related_pr_url)) {
    return NextResponse.json({ error: "related_pr_url must be a valid http(s) URL." }, { status: 400 });
  }

  let filesChanged: string[] = [];
  if (fields.files_changed !== undefined && fields.files_changed !== null) {
    if (!Array.isArray(fields.files_changed) || fields.files_changed.some((file) => typeof file !== "string")) {
      return NextResponse.json({ error: "files_changed must be an array of strings." }, { status: 400 });
    }
    if (fields.files_changed.length > ATTEMPT_FILES_MAX) {
      return NextResponse.json({ error: `files_changed must have at most ${ATTEMPT_FILES_MAX} entries.` }, { status: 400 });
    }
    if (fields.files_changed.some((file) => (file as string).length > ATTEMPT_FILE_PATH_MAX)) {
      return NextResponse.json(
        { error: `files_changed entries must be at most ${ATTEMPT_FILE_PATH_MAX} characters.` },
        { status: 400 }
      );
    }
    filesChanged = (fields.files_changed as string[]).map((file) => file.trim()).filter(Boolean);
  }

  const db = apiDataClient(guard.userId);

  const { data: task } = await db.from("tasks").select("id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: attempt, error } = await db
    .from("task_attempts")
    .insert({
      task_id: taskId,
      problem,
      approach,
      outcome,
      result: values.result,
      failure_reason: values.failure_reason,
      files_changed: filesChanged,
      related_pr_url: values.related_pr_url,
      agent: values.agent,
      created_by: guard.userId,
    })
    .select(ATTEMPT_COLUMNS)
    .single();

  if (error) {
    if (isPermissionDenied(error)) return NextResponse.json({ error: FORBIDDEN_MESSAGE }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ attempt });
}
