import { moduleManifestSchema, compareSemver, type ModuleManifest } from "./module-manifest";
import { MODULE_ENGINE_VERSION, parseModuleRecords, unsupportedModulePermissions, type ModuleRecord } from "./module-records";

export type ModulePreviewIssue = { code: "schema" | "permissions" | "engine" | "read" | "write" | "entities" | "views"; path: string };

/** Pure validation, without persistence, providers or installation side effects. */
export function validateModulePreview(input: unknown): { manifest: ModuleManifest | null; issues: ModulePreviewIssue[] } {
  const parsed = moduleManifestSchema.safeParse(input);
  if (!parsed.success) return { manifest: null, issues: parsed.error.issues.map(issue => ({ code: "schema", path: issue.path.join(".") })) };
  const manifest = parsed.data;
  const issues: ModulePreviewIssue[] = [];
  if (unsupportedModulePermissions(manifest).length) issues.push({ code: "permissions", path: "permissions" });
  if (!manifest.permissions.includes("module-data:read")) issues.push({ code: "read", path: "permissions" });
  if (manifest.views.some(view => view.type === "form") && !manifest.permissions.includes("module-data:write")) issues.push({ code: "write", path: "permissions" });
  if (compareSemver(MODULE_ENGINE_VERSION, manifest.engine.minVersion) < 0 || (manifest.engine.maxVersionExclusive && compareSemver(MODULE_ENGINE_VERSION, manifest.engine.maxVersionExclusive) >= 0)) issues.push({ code: "engine", path: "engine" });
  if (!manifest.entities.length) issues.push({ code: "entities", path: "entities" });
  if (!manifest.views.length) issues.push({ code: "views", path: "views" });
  return { manifest, issues };
}

/** Deterministic synthetic data only, never derived from project records. */
export function modulePreviewRecords(manifest: ModuleManifest): ModuleRecord[] {
  let sequence = 0;
  const records = manifest.entities.flatMap(entity => Array.from({ length: 3 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    entity: entity.id,
    values: Object.fromEntries(entity.fields.map(field => {
      let value: string | number | boolean;
      switch (field.type) {
        case "text": value = `${field.name} ${index + 1}`.slice(0, Math.min(field.maxLength ?? 32, 32)); break;
        case "number": value = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, index + 1)); break;
        case "boolean": value = index % 2 === 0; break;
        case "date": value = `2026-01-0${index + 1}`; break;
        case "select": value = field.options[index % field.options.length].value; break;
      }
      return [field.id, value];
    })),
  })));
  return parseModuleRecords(manifest, records);
}
