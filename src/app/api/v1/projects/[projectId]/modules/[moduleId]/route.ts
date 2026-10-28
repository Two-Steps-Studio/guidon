import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { getModulePackages } from "@/lib/data/module-packages";
import { prepareModuleChange } from "@/lib/work/module-lifecycle";
import { managersOnly, presentModule, projectRole } from "@/lib/api/module-api";
import { agentGate } from "@/lib/api/agent-gate";

/**
 * One installed module. GET (`project:read`). PATCH (`project:write`, owner/
 * admin) runs one lifecycle action - the same rules as the module's
 * Configuration page: enable, disable, uninstall (data is kept), or
 * settings (default view, sidebar category). Version changes and restoring
 * an uninstalled module need the permission review in the app.
 */
type Params = { params: Promise<{ projectId: string; moduleId: string }> };

type Loaded = { response: NextResponse } | { response?: undefined; projectId: string; moduleId: string; guard: { userId: string; humanClient: boolean }; db: ReturnType<typeof apiDataClient>; current: Awaited<ReturnType<typeof getModulePackages>>[number] };

async function load(request: NextRequest, params: Params["params"], scope: "project:read" | "project:write"): Promise<Loaded> {
  const { projectId, moduleId } = await params;
  if (!isValidUuid(projectId)) return { response: invalidIdResponse("projectId") };
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(moduleId)) return { response: NextResponse.json({ error: "Invalid module id." }, { status: 400 }) };
  const guard = await guardApiRequest(request, scope, { projectId });
  if (isGuardError(guard)) return { response: guard };
  const db = apiDataClient(guard.userId);
  const current = (await getModulePackages(guard.userId, projectId, db)).find((entry) => entry.moduleId === moduleId);
  if (!current) return { response: NextResponse.json({ error: "Module not found in this project." }, { status: 404 }) };
  return { projectId, moduleId, guard, db, current };
}

async function handleGET(request: NextRequest, { params }: Params) {
  const loaded = await load(request, params, "project:read");
  if (loaded.response) return loaded.response;
  return NextResponse.json({ module: presentModule(loaded.current) });
}

const patchBody = z.strictObject({
  action: z.enum(["enable", "disable", "uninstall", "settings"]),
  default_view: z.string().max(64).nullable().optional(),
  category: z.string().max(40).nullable().optional(),
});

async function handlePATCH(request: NextRequest, { params }: Params) {
  const loaded = await load(request, params, "project:write");
  if (loaded.response) return loaded.response;
  const { projectId, moduleId, guard, db, current } = loaded;
  const blocked = await agentGate(db, guard, projectId, "can_modify_settings");
  if (blocked) return blocked;
  let body;
  try { body = patchBody.parse(await request.json()); } catch { return NextResponse.json({ error: "Send action: enable, disable, uninstall or settings (with default_view/category)." }, { status: 400 }); }
  const role = await projectRole(db, projectId, guard.userId);
  if (!role || !["owner", "admin"].includes(role)) return managersOnly();
  const { data: project } = await db.from<{ organization_id: string }>("projects").select("organization_id").eq("id", projectId).maybeSingle();
  const form = new FormData();
  form.set("revision", String(current.revision));
  form.set("command", body.action);
  if (body.action === "settings") {
    const view = body.default_view === undefined ? current.settings.defaultView : body.default_view;
    const category = body.category === undefined ? current.settings.category : body.category;
    if (view) form.set("defaultView", view);
    if (category) form.set("category", category);
  }
  const digest = createHash("sha256").update(JSON.stringify(current.manifest)).digest("hex");
  const change = prepareModuleChange(current, digest, project?.organization_id ?? "", form);
  if (change.error) return NextResponse.json({ error: `The change was refused: ${change.error}.`, code: change.error }, { status: change.error === "conflict" ? 409 : 422 });
  const result = await db.from("project_module_packages").update(change.patch).eq("project_id", projectId).eq("module_id", moduleId).eq("revision", current.revision).select("module_id");
  if (result.error) return NextResponse.json({ error: "Could not save the module." }, { status: 500 });
  if (!result.data.length) return NextResponse.json({ error: "The module changed meanwhile. Read it again.", code: "conflict" }, { status: 409 });
  const updated = (await getModulePackages(guard.userId, projectId, db)).find((entry) => entry.moduleId === moduleId);
  return NextResponse.json({ module: updated ? presentModule(updated) : null });
}

export const GET = apiRoute(handleGET);
export const PATCH = apiRoute(handlePATCH);
