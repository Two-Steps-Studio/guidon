"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { compareSemver, moduleManifestSchema } from "@/lib/work/module-manifest";
import { MODULE_ENGINE_VERSION, MODULE_MANIFEST_BYTE_LIMIT, parseModuleRecords, unsupportedModulePermissions } from "@/lib/work/module-records";
import { hasExactModuleConsent } from "@/lib/work/module-installation";
import type { ModulePackageRow } from "@/lib/data/module-packages";

type Failure = { error: "permission" | "invalid" | "unsupported" | "consent" | "conflict" | "saveFailed" };
const validRevision = (revision: number) => Number.isSafeInteger(revision) && revision >= 0 && revision < 2147483647;

export async function createModulePackage(projectId: string, input: unknown, confirmedPermissions: string[], initialRecords: unknown = []): Promise<Failure | { error: null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: "permission" };
  let size: number;
  try { size = new TextEncoder().encode(JSON.stringify(input)).length; } catch { return { error: "invalid" }; }
  if (size > MODULE_MANIFEST_BYTE_LIMIT) return { error: "invalid" };
  const parsed = moduleManifestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const manifest = parsed.data;
  if (unsupportedModulePermissions(manifest).length || compareSemver(MODULE_ENGINE_VERSION, manifest.engine.minVersion) < 0 || (manifest.engine.maxVersionExclusive && compareSemver(MODULE_ENGINE_VERSION, manifest.engine.maxVersionExclusive) >= 0)) return { error: "unsupported" };
  if (!hasExactModuleConsent(manifest, confirmedPermissions)) return { error: "consent" };
  let records;
  try { records = parseModuleRecords(manifest, initialRecords); } catch { return { error: "invalid" }; }
  if (records.length && !manifest.permissions.includes("module-data:read")) return { error: "permission" };
  const { error } = await dataClient(access.userId).from("project_module_packages").insert({
    project_id: projectId, module_id: manifest.id, manifest,
    records: hasDirectDatabase() ? JSON.stringify(records) : records,
  });
  if (error) return { error: error.code === "23505" ? "conflict" : "saveFailed" };
  revalidatePath(`/projects/${projectId}/modules`);
  return { error: null };
}

export async function saveModuleRecords(projectId: string, moduleId: string, input: unknown, revision: number): Promise<Failure | { error: null; revision: number }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: "permission" };
  if (!validRevision(revision)) return { error: "invalid" };
  const db = dataClient(access.userId);
  const current = await db.from("project_module_packages").select<ModulePackageRow>("module_id, manifest, records, revision, enabled").eq("project_id", projectId).eq("module_id", moduleId).maybeSingle();
  if (current.error) return { error: "saveFailed" };
  if (!current.data) return { error: "permission" };
  if (current.data.revision !== revision) return { error: "conflict" };
  const manifest = moduleManifestSchema.safeParse(current.data.manifest);
  if (!manifest.success) return { error: "invalid" };
  if (!current.data.enabled || unsupportedModulePermissions(manifest.data).length || !manifest.data.permissions.includes("module-data:write") || !manifest.data.permissions.includes("module-data:read")) return { error: "permission" };
  let records;
  try { records = parseModuleRecords(manifest.data, input); } catch { return { error: "invalid" }; }
  const result = await db.from("project_module_packages").update({ records: hasDirectDatabase() ? JSON.stringify(records) : records, revision: revision + 1 })
    .eq("project_id", projectId).eq("module_id", moduleId).eq("revision", revision).eq("enabled", true).select("module_id");
  if (result.error) return { error: "saveFailed" };
  if (!result.data.length) return { error: "conflict" };
  revalidatePath(`/projects/${projectId}/modules`);
  return { error: null, revision: revision + 1 };
}
