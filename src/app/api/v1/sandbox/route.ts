import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api/api-route";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { ensureSandbox, findSandbox } from "@/lib/api/sandbox";
import { SITE_URL } from "@/lib/site-url";

/**
 * Sandbox / test environment: a separate organization and project with
 * example tasks for the key's user (src/lib/api/sandbox.ts). Point an agent
 * at the returned project_id to try things without touching real work.
 *
 * GET  - where the sandbox is (404 until it exists).
 * POST - create it if missing; { "reset": true } replaces its data.
 */
function describe(sandbox: { organization_id: string; project_id: string | null }) {
  return {
    ...sandbox,
    board_url: sandbox.project_id ? `${SITE_URL}/projects/${sandbox.project_id}/work` : null,
    reset_with: { method: "POST", url: `${SITE_URL}/api/v1/sandbox`, body: { reset: true } },
  };
}

async function handleGET(request: NextRequest) {
  const guard = await guardApiRequest(request, "tasks:read");
  if (isGuardError(guard)) return guard;
  const sandbox = await findSandbox(apiDataClient(guard.userId), guard.userId);
  if (!sandbox) {
    return NextResponse.json(
      { error: "No sandbox yet.", code: "not_found", hint: "POST /api/v1/sandbox creates one." },
      { status: 404 }
    );
  }
  return NextResponse.json({ sandbox: describe(sandbox) });
}

async function handlePOST(request: NextRequest) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;
  const body = (await request.json().catch(() => null)) as { reset?: unknown } | null;
  try {
    const sandbox = await ensureSandbox(apiDataClient(guard.userId), guard.userId, body?.reset === true);
    return NextResponse.json({ sandbox: describe(sandbox) }, { status: sandbox.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not set up the sandbox." }, { status: 400 });
  }
}

export const GET = apiRoute(handleGET);
export const POST = apiRoute(handlePOST);
