import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { getApiUserClient } from "@/lib/api/api-key-auth";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { buildProjectAgentContext } from "@/lib/context/project-context-builder";
import { clampBudget } from "@/lib/context/context-pack-core";
import { contextResponse } from "@/lib/context/context-response";

/**
 * Project context package as Markdown (Context Engine): constraints, facts,
 * decisions, sources and memory ranked within `max_tokens` (500-32000,
 * default 6000), optionally biased toward `focus` words. `tasks:read`; a
 * project the key's user can't read is a 404.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");
  const guard = await guardApiRequest(request, "tasks:read", { projectId });
  if (isGuardError(guard)) return guard;
  const search = request.nextUrl.searchParams;
  const context = await buildProjectAgentContext(guard.userId, projectId, () => getApiUserClient(guard.userId), {
    budget: clampBudget(search.get("max_tokens") ?? undefined),
    focus: (search.get("focus") ?? "").slice(0, 500),
  });
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.error === "Project not found." ? 404 : 500 });
  return contextResponse(context.markdown, context.stats, { kind: "project", projectId, apiKeyId: guard.apiKeyId });
}

export const GET = apiRoute(handleGET);
