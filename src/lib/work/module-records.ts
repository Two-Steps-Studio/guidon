import { z } from "zod";
import type { ModuleManifest } from "./module-manifest";

/** 1.1 adds page views and url fields; manifests without them still declare 1.0. */
export const MODULE_ENGINE_VERSION = "1.1.0";
export const MODULE_DATA_LIMIT = 1_000;
export const MODULE_MANIFEST_BYTE_LIMIT = 200_000;
export const MODULE_DATA_BYTE_LIMIT = 1_000_000;
export const RUNTIME_PERMISSIONS = ["module-data:read", "module-data:write"] as const;

const recordSchema = z.strictObject({
  id: z.uuid(),
  entity: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  values: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), z.union([z.string().max(10_000), z.number().finite(), z.boolean(), z.null()])),
});
export type ModuleRecord = z.infer<typeof recordSchema>;

export function parseModuleRecords(manifest: ModuleManifest, input: unknown): ModuleRecord[] {
  const entities = new Map(manifest.entities.map((entity) => [entity.id, entity]));
  return z.array(recordSchema).max(MODULE_DATA_LIMIT).superRefine((records, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(records)).length > MODULE_DATA_BYTE_LIMIT) {
      ctx.addIssue({ code: "custom", message: "Module data exceeds 1 MB." });
    }
    const ids = new Set<string>();
    records.forEach((record, index) => {
      if (ids.has(record.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "Record IDs must be unique." });
      ids.add(record.id);
      const entity = entities.get(record.entity);
      if (!entity) {
        ctx.addIssue({ code: "custom", path: [index, "entity"], message: "Unknown entity." });
        return;
      }
      const fields = new Map(entity.fields.map((field) => [field.id, field]));
      for (const key of Object.keys(record.values)) {
        if (!fields.has(key)) ctx.addIssue({ code: "custom", path: [index, "values", key], message: "Unknown field." });
      }
      for (const field of entity.fields) {
        const value = Object.hasOwn(record.values, field.id) ? record.values[field.id] : undefined;
        if (value === undefined || value === null || value === "") {
          if (field.required) ctx.addIssue({ code: "custom", path: [index, "values", field.id], message: "Required field." });
          continue;
        }
        let valid = false;
        switch (field.type) {
          case "text": valid = typeof value === "string" && value.length <= (field.maxLength ?? 10_000) && (!field.required || value.trim().length > 0); break;
          case "number": valid = typeof value === "number" && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max); break;
          case "boolean": valid = typeof value === "boolean"; break;
          case "select": valid = typeof value === "string" && field.options.some((option) => option.value === value); break;
          case "url": valid = typeof value === "string" && isModuleUrl(value); break;
          case "date": valid = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; break;
        }
        if (!valid) ctx.addIssue({ code: "custom", path: [index, "values", field.id], message: `Invalid ${field.type} value.` });
      }
    });
  }).parse(input);
}

/** Absolute HTTP(S) address up to 2,000 characters - never javascript:, data: or relative. */
export function isModuleUrl(value: string): boolean {
  if (value.length > 2000) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

export function unsupportedModulePermissions(manifest: ModuleManifest): string[] {
  return manifest.permissions.filter((permission) => !RUNTIME_PERMISSIONS.some((allowed) => allowed === permission));
}

export type InstalledModule = {
  moduleId: string;
  manifest: ModuleManifest;
  records: ModuleRecord[];
  revision: number;
  enabled: boolean;
  installed: boolean;
  settings: { defaultView?: string; category?: string };
};

/** A module's sidebar category: shared by catalog and content modules. */
export const moduleCategorySchema = z.string().trim().min(1).max(40);

export function parseModuleSettings(manifest: ModuleManifest, input: unknown): InstalledModule["settings"] {
  return z.strictObject({ defaultView: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(), category: moduleCategorySchema.optional() }).superRefine((settings, ctx) => {
    if (settings.defaultView && !manifest.views.some((view) => view.id === settings.defaultView)) ctx.addIssue({ code: "custom", path: ["defaultView"], message: "Unknown module view." });
  }).parse(input);
}
