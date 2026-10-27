"use server";

import { revalidatePath } from "next/cache";
import { getManagedModule } from "@/lib/data/module-manager";
import { dataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { logActivity } from "@/lib/data/log-activity";
import { compareSemver, MODULE_SCRIPT_MAX_CHARS, moduleManifestSchema } from "@/lib/work/module-manifest";
import { parseModuleRecords } from "@/lib/work/module-records";

export type SaveScriptResult = { error: null; revision: number } | { error: "permission" | "catalog" | "consent" | "invalid" | "conflict" | "saveFailed"; detail?: string };

/**
 * Saves a module's script (engine 1.3). Only for modules made in this
 * project: a Marketplace version is immutable and reviewed - change it by
 * publishing your own version. The first script needs explicit consent,
 * which adds the code:run permission and a custom view.
 */
export async function saveModuleScript(projectId: string, moduleId: string, source: string, revision: number, consent: boolean): Promise<SaveScriptResult> {
  const context = await getManagedModule(projectId, moduleId);
  if (!context) return { error: "permission" };
  const { access, current } = context;
  if (typeof source !== "string" || !source.trim() || source.length > MODULE_SCRIPT_MAX_CHARS) return { error: "invalid", detail: "size" };
  if (!Number.isSafeInteger(revision) || revision !== current.revision) return { error: "conflict" };
  const db = dataClient(access.userId);
  const origin = await db.from<{ catalog_version: string | null }>("project_module_packages").select("catalog_version").eq("project_id", projectId).eq("module_id", moduleId).maybeSingle();
  if (origin.error || !origin.data) return { error: "saveFailed" };
  if (origin.data.catalog_version) return { error: "catalog" };
  const permissions = current.manifest.permissions.includes("code:run") ? current.manifest.permissions : consent ? [...current.manifest.permissions, "code:run" as const] : null;
  if (!permissions) return { error: "consent" };
  const views = current.manifest.views.some((view) => view.type === "custom") ? current.manifest.views
    : [...current.manifest.views, { id: current.manifest.views.some((view) => view.id === "custom") ? "custom-view" : "custom", name: current.manifest.name, type: "custom" as const }];
  const engine = compareSemver(current.manifest.engine.minVersion, "1.3.0") < 0 ? { ...current.manifest.engine, minVersion: "1.3.0" } : current.manifest.engine;
  const parsed = moduleManifestSchema.safeParse({ ...current.manifest, engine, permissions, views, script: { source } });
  if (!parsed.success) return { error: "invalid", detail: parsed.error.issues[0]?.message };
  try { parseModuleRecords(parsed.data, current.records); } catch { return { error: "invalid", detail: "records" }; }
  const result = await db.from("project_module_packages").update({ manifest: hasDirectDatabase() ? JSON.stringify(parsed.data) : parsed.data, revision: revision + 1 })
    .eq("project_id", projectId).eq("module_id", moduleId).eq("revision", revision).select("module_id");
  if (result.error) return { error: "saveFailed" };
  if (!result.data.length) return { error: "conflict" };
  await logActivity({ userId: access.userId, projectId, action: "module_code_saved", entityType: "module", details: { moduleId, characters: source.length } });
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, revision: revision + 1 };
}
