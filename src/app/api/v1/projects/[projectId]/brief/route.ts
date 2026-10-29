import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { getBriefVersion } from "@/lib/data/agent-brief";

/**
 * The project's agent brief as Markdown (`tasks:read`, like the context
 * routes): the latest version its owners/admins approved, or `?version=N`
 * exactly as it was approved. 404 with a hint when there is none yet.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");
  const guard = await guardApiRequest(request, "tasks:read", { projectId });
  if (isGuardError(guard)) return guard;

  const raw = request.nextUrl.searchParams.get("version");
  const version = raw === null ? undefined : Number(raw);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    return NextResponse.json({ error: "version must be a positive integer." }, { status: 400 });
  }

  const brief = await getBriefVersion(apiDataClient(guard.userId), projectId, version);
  if (!brief) {
    return NextResponse.json(
      {
        error: version ? `Version ${version} of the agent brief doesn't exist.` : "This project has no approved agent brief yet.",
        hint: "Use get_project_context for the project's ranked context; a project owner or admin can approve a brief on the project's Agent brief page.",
      },
      { status: 404 }
    );
  }
  return new NextResponse(brief.content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Brief-Version": String(brief.version),
      "X-Brief-Approved-At": new Date(brief.approved_at).toISOString(),
    },
  });
}

export const GET = apiRoute(handleGET);
