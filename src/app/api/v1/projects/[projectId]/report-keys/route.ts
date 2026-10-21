import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { mintApiKey } from "@/lib/api/mint-api-key";
import { apiRoute } from "@/lib/api/api-route";

/** Names the key on the website (Profile → API Keys); anything else is "Game". */
const CLIENT_NAMES: Record<string, string> = {
  unity: "Unity",
  unreal: "Unreal",
  godot: "Godot",
};

/**
 * "Set up in-game reports" in the editor plugins: mints the key the game's
 * reporter ships with - `reports:write` only, bound to this project
 * (migration 054) - so nobody has to create one on the website and paste
 * it into the engine's settings. Returns `{ key, keyPrefix, projectId }`;
 * the full key is shown this once, like every API key.
 *
 * Only for keys from the plugins' own login (human_client, migration 039):
 * an AI agent's key has no business minting more keys, and a narrower key
 * from a broader one is the only direction this goes - the new key can file
 * reports into one project, which the caller's tasks:write already covers.
 * RLS decides the rest: api_keys_insert needs owner/admin/developer in the
 * project for a bound key, the same roles that may create the tasks.
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const guard = await guardApiRequest(request, "tasks:write");
  if (isGuardError(guard)) return guard;
  if (!guard.humanClient) {
    return NextResponse.json(
      { error: "Report keys can only be created from a Guidon editor plugin or the website." },
      { status: 403 }
    );
  }

  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");

  let client = "game";
  try {
    const body = (await request.json()) as { client?: unknown };
    if (typeof body?.client === "string") client = body.client;
  } catch {
    // No body is fine - the client name is cosmetic.
  }

  const db = apiDataClient(guard.userId);
  const { data: project, error: projectError } = await db
    .from<{ id: string; name: string }>("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const date = new Date().toISOString().slice(0, 10);
  const label = CLIENT_NAMES[client] ?? "Game";
  const result = await mintApiKey(db, guard.userId, `${label} bug reports - ${project.name} ${date}`, ["reports:write"], {
    projectId,
    allowedOrigins: null,
  });

  if (result.error || !result.fullKey || !result.row) {
    // RLS refusal (viewer/tester role) surfaces as a generic insert error.
    console.error("Report key mint failed:", result.error);
    return NextResponse.json(
      { error: "Could not create a report key - you need the owner, admin or developer role in this project." },
      { status: 403 }
    );
  }

  return NextResponse.json(
    { key: result.fullKey, keyPrefix: result.row.key_prefix, projectId },
    { status: 201 }
  );
}

export const POST = apiRoute(handlePOST);
