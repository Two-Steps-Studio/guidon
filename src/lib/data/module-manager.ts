import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { MODULE_PACKAGE_COLUMNS, decodeModulePackage, type ModulePackageRow } from "@/lib/data/module-packages";
import { dataClient } from "@/lib/data-client";

export async function getManagedModule(projectId: string, moduleId: string) {
  if (!z.uuid().safeParse(projectId).success || !/^[a-z][a-z0-9-]{0,63}$/.test(moduleId)) return null;
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return null;
  const row = await dataClient(access.userId).from("project_module_packages").select<ModulePackageRow>(MODULE_PACKAGE_COLUMNS).eq("project_id", projectId).eq("module_id", moduleId).maybeSingle();
  if (row.error) throw new Error("Could not load managed module. Apply migration 082 before deployment.");
  if (!row.data) return null;
  const current = decodeModulePackage(row.data);
  return { access, current, digest: createHash("sha256").update(JSON.stringify(current.manifest)).digest("hex") };
}
