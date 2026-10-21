import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { getJob, presentJob } from "@/lib/api/jobs";

/** GET /api/v1/jobs/{jobId}: an async job's status, progress and result. Retry-After while it's still working. */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;
  const { jobId } = await params;
  if (!isValidUuid(jobId)) return invalidIdResponse("jobId");
  const job = await getJob(guard.userId, jobId);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const finished = job.status === "succeeded" || job.status === "failed";
  return NextResponse.json({ job: presentJob(job) }, { headers: finished ? {} : { "Retry-After": "2" } });
}

export const GET = apiRoute(handleGET);
