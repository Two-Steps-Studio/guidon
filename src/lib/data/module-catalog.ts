import "server-only";
import { createHash } from "node:crypto";
import { dataClient, type DataClient } from "@/lib/data-client";
import { compareSemver, moduleManifestSchema, type ModuleManifest } from "@/lib/work/module-manifest";
import { MODULE_ENGINE_VERSION, parseModuleRecords, unsupportedModulePermissions, type ModuleRecord } from "@/lib/work/module-records";
import type { CatalogCard } from "@/lib/work/module-catalog";
import { checkModuleSignature, moduleSigningKey, type SignatureCheck } from "@/lib/work/module-signing";

export type RegistryStatus = "pending_review" | "published" | "rejected" | "withdrawn";
export type RegistryVisibility = "private" | "organization" | "public";
export type CatalogEntry = CatalogCard & {
  manifest: ModuleManifest; demoRecords: ModuleRecord[]; changelog: string; screenshots: string[]; organizationId: string | null;
  /** SHA-256 of the normalized manifest the page shows; install consent is bound to it. */
  digest: string;
  status: RegistryStatus; visibility: RegistryVisibility; license: string; submittedBy: string | null; submittedAt: string;
  reviewNote: string | null; signature: SignatureCheck;
};

export const CATALOG_COLUMNS = "module_id, version, category, description, manifest, demo_records, changelog, screenshots, organization_id, status, visibility, license, submitted_by, submitted_at, review_note, digest, signature, signing_key_id";
export type CatalogRow = {
  module_id: string; version: string; category: CatalogCard["category"]; description: string; manifest: unknown; demo_records: unknown;
  changelog: string; screenshots: string[]; organization_id: string | null; status: RegistryStatus; visibility: RegistryVisibility;
  license: string; submitted_by: string | null; submitted_at: string | Date; review_note: string | null; digest: string; signature: string | null; signing_key_id: string | null;
};

export function decodeCatalogRow(row: CatalogRow): CatalogEntry {
  const manifest = moduleManifestSchema.parse(row.manifest);
  if (row.module_id !== manifest.id || row.version !== manifest.version) throw new Error("Invalid catalog entry identity");
  const digest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  const compatible = !unsupportedModulePermissions(manifest).length
    && compareSemver(MODULE_ENGINE_VERSION, manifest.engine.minVersion) >= 0
    && (!manifest.engine.maxVersionExclusive || compareSemver(MODULE_ENGINE_VERSION, manifest.engine.maxVersionExclusive) < 0);
  return {
    moduleId: row.module_id, version: row.version, name: manifest.name, author: manifest.author.name, description: row.description, category: row.category, compatible,
    manifest, demoRecords: parseModuleRecords(manifest, row.demo_records), changelog: row.changelog,
    screenshots: row.screenshots.filter((path) => /^\/module-media\/[a-z0-9][a-z0-9._/-]*$/.test(path) && !path.includes("..")),
    organizationId: row.organization_id, digest,
    status: row.status, visibility: row.visibility, license: row.license, submittedBy: row.submitted_by, submittedAt: new Date(row.submitted_at).toISOString(), reviewNote: row.review_note,
    signature: checkModuleSignature(moduleSigningKey(), { moduleId: row.module_id, version: row.version, digest, signature: row.signature, keyId: row.signing_key_id }),
  };
}

/** Rows the app can't read (an older manifest shape) are left out rather than breaking the page. */
function decodeAll(rows: CatalogRow[]): CatalogEntry[] {
  return rows.flatMap((row) => { try { return [decodeCatalogRow(row)]; } catch { return []; } });
}

/** Published versions the caller may see (RLS: public, own organization's, own private). */
export async function getModuleCatalog(userId: string): Promise<CatalogEntry[]> {
  const { data, error } = await dataClient(userId).from("module_catalog_entries").select<CatalogRow>(CATALOG_COLUMNS).eq("status", "published").order("module_id").order("version").limit(200);
  if (error) throw new Error("Could not load module catalog. Apply migrations 081 and 093 before deployment.");
  return decodeAll(data);
}

/** One version, any status the caller may see (authors see their pending/rejected ones). */
export async function getCatalogEntry(userId: string, moduleId: string, version: string, db: DataClient = dataClient(userId)): Promise<CatalogEntry | null> {
  const { data, error } = await db.from("module_catalog_entries").select<CatalogRow>(CATALOG_COLUMNS).eq("module_id", moduleId).eq("version", version).maybeSingle();
  if (error) throw new Error("Could not load catalog entry");
  return data ? decodeAll([data])[0] ?? null : null;
}

/** Installable versions of a module: published and, when signed, verified. */
export async function getCatalogVersions(userId: string, moduleId: string): Promise<CatalogEntry[]> {
  const { data, error } = await dataClient(userId).from("module_catalog_entries").select<CatalogRow>(CATALOG_COLUMNS).eq("module_id", moduleId).eq("status", "published").limit(50);
  if (error) throw new Error("Could not load module releases");
  return decodeAll(data).filter(isInstallable).sort((left, right) => compareSemver(right.version, left.version));
}

/** A version may be installed only if it is published and its signature (if any) checks out. */
export function isInstallable(entry: CatalogEntry): boolean {
  return entry.status === "published" && entry.signature !== "invalid";
}
