import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { buildReport, REPORT_LIMITS, validateReportFiles } from "@/lib/api/game-report";
import { getOrgPlanLimits, isStorageLimitReached, isTaskLimitReached } from "@/lib/limits";
import { getOrganizationStorageUsage, uploadTaskAttachment } from "@/lib/storage/storage";

/** Whole request cap - checked from Content-Length before the body is read. */
const MAX_REQUEST_BYTES = REPORT_LIMITS.files * REPORT_LIMITS.fileBytes + 1024 * 1024;

function isRlsRejection(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "42501";
}

const FORBIDDEN = "This API key's user may not create tasks in this project (needs owner, admin or developer).";

/**
 * In-game bug reports: the Guidon report SDKs for Unity/Unreal (plugins/*
 * /GuidonReports) post here from inside a running game - a title, the
 * player's description, a small metadata table (build, platform, scene,
 * position...) and up to three screenshots/logs. Creates one Backlog task
 * tagged `<category>` + `in-game`, with the files as task attachments.
 *
 * Gated by its own `reports:write` scope, and that scope opens nothing else:
 * the key is embedded in a game build and must be assumed extractable, so a
 * leaked report key can file reports (rate-limited per key like every
 * route) but never read or change the project. multipart/form-data:
 * `title` (required), `description`, `category` (bug|crash|feedback),
 * `reporter`, `metadata` (JSON object of short values), `file` (repeatable).
 *
 * Identity is still the key's user, and RLS still decides: tasks_insert
 * needs owner/admin/developer, task_attachments_insert owner/admin/
 * developer/tester, so a report key must be created by someone with one of
 * the former roles in the project.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "reports:write");
  if (isGuardError(guard)) return guard;

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  // Required, not just checked when present: without it (chunked upload)
  // formData() would buffer an unbounded body, and this route's key ships
  // inside game builds, so it has to be treated as public.
  const declaredLength = Number(request.headers.get("content-length"));
  if (!request.headers.get("content-length") || !Number.isFinite(declaredLength)) {
    return NextResponse.json({ error: "Content-Length is required." }, { status: 411 });
  }
  if (declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Report is too large." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart/form-data." }, { status: 400 });
  }

  const report = buildReport({
    title: form.get("title"),
    description: form.get("description"),
    category: form.get("category"),
    reporter: form.get("reporter"),
    metadata: form.get("metadata"),
  });
  if (!report.ok) return NextResponse.json({ error: report.error }, { status: 400 });

  const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
  const fileCheck = validateReportFiles(files.map((file) => ({ name: file.name, size: file.size })));
  if (!fileCheck.ok) return NextResponse.json({ error: fileCheck.error }, { status: 400 });
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  const { title, description, tags } = report.value;
  let task: { id: string; title: string };

  if (hasDirectDatabase()) {
    const project = await withUser(guard.userId, ({ query }) =>
      query("SELECT 1 FROM projects WHERE id = $1", [projectId])
    );
    if (project.rows.length === 0) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    try {
      const result = await withUser(guard.userId, ({ query }) =>
        query(
          `INSERT INTO tasks (project_id, title, description, status, priority, tags, created_by)
           VALUES ($1, $2, $3, 'backlog', 'medium', $4, $5)
           RETURNING id, title`,
          [projectId, title, description, tags, guard.userId]
        )
      );
      task = result.rows[0];
    } catch (error) {
      if (isRlsRejection(error)) return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
      throw error;
    }
  } else {
    const supabase = await getApiUserClient(guard.userId);
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, organization_id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    // Plan limits - hosted-only, same asymmetry as the tasks route and uploadTaskAttachment.
    const { planName, taskLimitPerProject, storageLimitBytes } = await getOrgPlanLimits(project.organization_id);
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("parent_task_id", null);
    if (isTaskLimitReached(count ?? 0, taskLimitPerProject)) {
      return NextResponse.json({ error: `The project reached its ${planName} plan's task limit.` }, { status: 403 });
    }
    if (totalBytes > 0) {
      const usage = await getOrganizationStorageUsage(project.organization_id);
      if (isStorageLimitReached(usage + totalBytes, storageLimitBytes)) {
        return NextResponse.json({ error: `The attachments would exceed the ${planName} plan's storage limit.` }, { status: 403 });
      }
    }

    const { data: created, error } = await supabase
      .from("tasks")
      .insert({ project_id: projectId, title, description, status: "backlog", priority: "medium", tags, created_by: guard.userId })
      .select("id, title")
      .single();
    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    task = created;
  }

  // The task exists from here on; a failed file is reported back rather
  // than undoing the whole report - the text is usually the valuable part.
  const attachments: Array<{ id: string; name: string }> = [];
  const warnings: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = fileCheck.value[i];
    try {
      const stored = await uploadTaskAttachment(projectId, task.id, new File([file], name, { type: file.type }), guard.userId);
      const row = { task_id: task.id, name, storage_path: stored.path, size_bytes: file.size, mime_type: file.type || "application/octet-stream", uploaded_by: guard.userId };
      if (hasDirectDatabase()) {
        const result = await withUser(guard.userId, ({ query }) =>
          query(
            `INSERT INTO task_attachments (task_id, name, storage_path, size_bytes, mime_type, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name`,
            [row.task_id, row.name, row.storage_path, row.size_bytes, row.mime_type, row.uploaded_by]
          )
        );
        attachments.push(result.rows[0]);
      } else {
        const supabase = await getApiUserClient(guard.userId);
        const { data, error } = await supabase.from("task_attachments").insert(row).select("id, name").single();
        if (error) throw error;
        attachments.push(data);
      }
    } catch (error) {
      warnings.push(`${name}: ${error instanceof Error ? error.message : "upload failed"}`);
    }
  }

  const activity = { project_id: projectId, user_id: guard.userId, action: "task_created", entity_type: "task", entity_id: task.id };
  if (hasDirectDatabase()) {
    await withUser(guard.userId, ({ query }) =>
      query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4, $5)`,
        [activity.project_id, activity.user_id, activity.action, activity.entity_type, activity.entity_id]
      )
    );
  } else {
    const supabase = await getApiUserClient(guard.userId);
    await supabase.from("activity_logs").insert(activity);
  }

  return NextResponse.json({ task, attachments, warnings }, { status: 201 });
}
