import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { buildAgentsMd } from "@/lib/data/agents-md";

/**
 * The project as an AGENTS.md file a repository can keep (`tasks:read`, like
 * the brief): approved brief, verified facts, known dead ends.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");
  const guard = await guardApiRequest(request, "tasks:read", { projectId });
  if (isGuardError(guard)) return guard;

  const markdown = await buildAgentsMd(apiDataClient(guard.userId), projectId);
  if (!markdown) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return new NextResponse(markdown, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'inline; filename="AGENTS.md"' },
  });
}

export const GET = apiRoute(handleGET);
