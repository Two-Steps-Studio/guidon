import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest, isGuardError } from "@/lib/api/route-guard";
import { apiDataClient } from "@/lib/api/api-data-client";
import { isValidUuid, invalidIdResponse } from "@/lib/api/validate-id";
import { apiRoute } from "@/lib/api/api-route";
import { getModulePackages } from "@/lib/data/module-packages";
import { getCatalogEntry, isInstallable } from "@/lib/data/module-catalog";
import { moduleManifestSchema } from "@/lib/work/module-manifest";
import { installCatalogModule } from "@/lib/work/module-installation";
import { managersOnly, presentModule, projectRole } from "@/lib/api/module-api";
import { agentGate } from "@/lib/api/agent-gate";

/**
 * Modules of a project (migrations 080-094). GET lists them (`project:read`,
 * any member). POST installs a published Marketplace version
 * (`project:write`, project owner/admin): `permissions` must repeat the
 * version's permission list exactly - that is the caller's approval, as the
 * checkbox is in the app - and `digest` (from the Marketplace) is optional
 * protection against the version changing between reading and installing.
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");
  const guard = await guardApiRequest(request, "project:read", { projectId });
  if (isGuardError(guard)) return guard;
  const db = apiDataClient(guard.userId);
  const { data: project } = await db.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const modules = await getModulePackages(guard.userId, projectId, db);
  return NextResponse.json({ modules: modules.map(presentModule) });
}

const installBody = z.strictObject({
  module_id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  version: z.string().regex(/^[0-9A-Za-z.+-]{1,128}$/),
  permissions: z.array(z.string().max(64)).max(20),
  digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

const INSTALL_ERRORS = {
  permission: [403, "This version can't be installed in this project (not visible to you, another organization's, withdrawn or with an invalid signature)."],
  unsupported: [422, "This version needs a newer Guidon or requests unsupported permissions."],
  consent: [422, "`permissions` must list exactly the permissions this version requests."],
  conflict: [409, "A different version of this module is installed, or the version changed. Read it again."],
  limit: [409, "This project has 20 modules installed."],
  saveFailed: [500, "Installation failed. Nothing was saved."],
} as const;

async function handlePOST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isValidUuid(projectId)) return invalidIdResponse("projectId");
  const guard = await guardApiRequest(request, "project:write", { projectId });
  if (isGuardError(guard)) return guard;
  let body;
  try { body = installBody.parse(await request.json()); } catch { return NextResponse.json({ error: "Send module_id, version and permissions (the version's exact permission list)." }, { status: 400 }); }
  const db = apiDataClient(guard.userId);
  const { data: project } = await db.from<{ organization_id: string }>("projects").select("organization_id").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const blocked = await agentGate(db, guard, projectId, "can_modify_settings");
  if (blocked) return blocked;
  const role = await projectRole(db, projectId, guard.userId);
  if (!role || !["owner", "admin"].includes(role)) return managersOnly();
  const entry = await getCatalogEntry(guard.userId, body.module_id, body.version, db);
  const result = await installCatalogModule({ projectId, moduleId: body.module_id, version: body.version, permissions: body.permissions, expectedDigest: body.digest ?? entry?.digest ?? "" }, {
    async getProject() { return { organizationId: project.organization_id, canManage: true }; },
    async getEntry() { return entry && isInstallable(entry) ? entry : null; },
    async getExisting(id, name) {
      const current = await db.from<{ manifest: unknown }>("project_module_packages").select("manifest").eq("project_id", id).eq("module_id", name).maybeSingle();
      if (current.error) throw new Error("Could not check module installation");
      if (!current.data) return null;
      const parsed = moduleManifestSchema.safeParse(current.data.manifest);
      return { manifest: parsed.success ? parsed.data : null };
    },
    async insert(id, manifest) {
      const { error } = await db.from("project_module_packages").insert({ project_id: id, module_id: manifest.id, manifest, catalog_version: manifest.version });
      return !error ? "created" : error.code === "23505" ? "duplicate" : error.code === "23514" ? "limit" : "failed";
    },
  });
  if (result.error) {
    const [status, message] = INSTALL_ERRORS[result.error];
    return NextResponse.json({ error: message, code: result.error }, { status });
  }
  const installed = (await getModulePackages(guard.userId, projectId, db)).find((candidate) => candidate.moduleId === body.module_id);
  return NextResponse.json({ module: installed ? presentModule(installed) : null, already_installed: result.existing }, { status: result.existing ? 200 : 201 });
}

export const GET = apiRoute(handleGET);
export const POST = apiRoute(handlePOST);
