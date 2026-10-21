import { after, NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { createJob, jobUrl, presentJob, updateJob } from "@/lib/api/jobs";
import { withoutRateLimit } from "@/lib/api/rate-limit";
import { POST as createTask } from "@/app/api/v1/projects/[projectId]/tasks/route";

const MAX_IMPORT = 500;

/**
 * POST /api/v1/projects/{projectId}/tasks/import - create many tasks at
 * once, asynchronously: `{ "tasks": [{ "title", ... }] }` (up to 500, the
 * same fields as POST .../tasks). Answers 202 Accepted with Location:
 * /api/v1/jobs/{id}; the tasks are created after the response, one by one
 * through the same handler as a direct create (scopes, permissions, plan
 * limits), and the job records what was created and what failed.
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;
  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  const body = (await request.json().catch(() => null)) as { tasks?: unknown } | null;
  const tasks = Array.isArray(body?.tasks) ? body.tasks : null;
  if (!tasks || tasks.length === 0) return NextResponse.json({ error: "tasks must be a non-empty array." }, { status: 400 });
  if (tasks.length > MAX_IMPORT) return NextResponse.json({ error: `At most ${MAX_IMPORT} tasks per import.` }, { status: 400 });
  if (tasks.some((task) => !task || typeof task !== "object" || typeof (task as { title?: unknown }).title !== "string")) {
    return NextResponse.json({ error: "Every task needs a title." }, { status: 400 });
  }

  const { data: project } = await apiDataClient(guard.userId).from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const job = await createJob(guard.userId, "task_import", tasks.length);
  const authorization = request.headers.get("authorization")!;
  const origin = new URL(request.url).origin;

  // The import was one counted request; its tasks don't each count again.
  after(() => withoutRateLimit(async () => {
    await updateJob(job.id, { status: "running" });
    const created: string[] = [];
    const failed: { index: number; status: number; error: string }[] = [];
    for (const [index, task] of tasks.entries()) {
      try {
        const response = await createTask(
          new NextRequest(new URL(`/api/v1/projects/${projectId}/tasks`, origin), {
            method: "POST",
            headers: { authorization, "content-type": "application/json" },
            body: JSON.stringify(task),
          }),
          { params: Promise.resolve({ projectId }) }
        );
        const result = (await response.json().catch(() => null)) as { task?: { id: string }; error?: string } | null;
        if (response.ok && result?.task) created.push(result.task.id);
        else failed.push({ index, status: response.status, error: result?.error ?? "Failed." });
      } catch (error) {
        failed.push({ index, status: 500, error: error instanceof Error ? error.message : "Failed." });
      }
      if ((index + 1) % 10 === 0) await updateJob(job.id, { done: index + 1 });
    }
    await updateJob(job.id, {
      status: created.length === 0 ? "failed" : "succeeded",
      done: tasks.length,
      result: { created, failed },
      error: created.length === 0 ? "No task could be created - see result.failed." : null,
    });
  }));

  return NextResponse.json(
    { job: presentJob(job) },
    { status: 202, headers: { Location: jobUrl(job.id), "Retry-After": "2" } }
  );
}

export const POST = apiRoute(handlePOST);
