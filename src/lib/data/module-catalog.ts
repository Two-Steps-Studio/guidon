import "server-only";
import { createHash } from "node:crypto";
import { dataClient } from "@/lib/data-client";
import { compareSemver, moduleManifestSchema, type ModuleManifest } from "@/lib/work/module-manifest";
import { MODULE_ENGINE_VERSION, parseModuleRecords, unsupportedModulePermissions, type ModuleRecord } from "@/lib/work/module-records";
import type { CatalogCard } from "@/lib/work/module-catalog";

export type CatalogEntry = CatalogCard & { manifest: ModuleManifest; demoRecords: ModuleRecord[]; changelog: string; screenshots: string[]; organizationId: string | null; digest: string };
type Row = { module_id: string; version: string; category: CatalogCard["category"]; description: string; manifest: unknown; demo_records: unknown; changelog: string; screenshots: string[]; organization_id: string | null };

function decode(row: Row): CatalogEntry {
  const manifest = moduleManifestSchema.parse(row.manifest);
  if (row.module_id !== manifest.id || row.version !== manifest.version) throw new Error("Invalid catalog entry identity");
  const compatible = !unsupportedModulePermissions(manifest).length
    && compareSemver(MODULE_ENGINE_VERSION, manifest.engine.minVersion) >= 0
    && (!manifest.engine.maxVersionExclusive || compareSemver(MODULE_ENGINE_VERSION, manifest.engine.maxVersionExclusive) < 0);
  return { moduleId: row.module_id, version: row.version, name: manifest.name, author: manifest.author.name, description: row.description, category: row.category, compatible, manifest, demoRecords: parseModuleRecords(manifest, row.demo_records), changelog: row.changelog, screenshots: row.screenshots.filter((path) => /^\/module-media\/[a-z0-9][a-z0-9._/-]*$/.test(path) && !path.includes("..")), organizationId: row.organization_id, digest: createHash("sha256").update(JSON.stringify(manifest)).digest("hex") };
}

export async function getModuleCatalog(userId: string): Promise<CatalogEntry[]> {
  const { data, error } = await dataClient(userId).from("module_catalog_entries").select<Row>("module_id, version, category, description, manifest, demo_records, changelog, screenshots, organization_id").order("module_id").order("version").limit(200);
  if (error) throw new Error("Could not load module catalog. Apply migration 081 before deployment.");
  return data.map(decode);
}

export async function getCatalogEntry(userId: string, moduleId: string, version: string): Promise<CatalogEntry | null> {
  const { data, error } = await dataClient(userId).from("module_catalog_entries").select<Row>("module_id, version, category, description, manifest, demo_records, changelog, screenshots, organization_id").eq("module_id", moduleId).eq("version", version).maybeSingle();
  if (error) throw new Error("Could not load catalog entry");
  return data ? decode(data) : null;
}
