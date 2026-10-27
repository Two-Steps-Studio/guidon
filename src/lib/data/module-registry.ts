import "server-only";
import { dataClient, serviceDataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { compareSemver, moduleManifestSchema, type ModuleManifest } from "@/lib/work/module-manifest";
import { moduleSigningKey, signModuleVersion } from "@/lib/work/module-signing";
import { MODULE_LICENSES, reviewModuleSubmission } from "@/lib/work/module-review";
import type { ProjectAccess } from "@/lib/data/project-access";
import { getModulePackages } from "@/lib/data/module-packages";
import { getModuleDraft } from "@/lib/data/module-drafts";
import type { CatalogCard } from "@/lib/work/module-catalog";
import { decodeCatalogRow, CATALOG_COLUMNS, type CatalogEntry, type CatalogRow, type RegistryVisibility } from "@/lib/data/module-catalog";

/**
 * Publishing to the module registry (migration 093). Everything here runs as
 * the signed-in person through RLS and the registry's SECURITY DEFINER
 * functions, except signing a published version (service role: the
 * signature columns have no authenticated grant).
 */

export type PublishSource = { kind: "draft" } | { kind: "package"; moduleId: string };
export type PublishError = "permission" | "noManifest" | "invalid" | "blocked" | "version" | "taken" | "exists" | "failed";
export const PUBLISH_CATEGORIES = ["planning", "research", "operations"] as const satisfies readonly CatalogCard["category"][];

/** The manifest a project owner/admin wants to publish: their builder draft, or a module installed in the project. */
export async function loadPublishSource(access: ProjectAccess, source: PublishSource): Promise<ModuleManifest | null> {
  if (source.kind === "draft") return (await getModuleDraft(access)).state.present.manifest;
  const installed = (await getModulePackages(access.userId, access.project.id)).find((entry) => entry.moduleId === source.moduleId);
  return installed?.manifest ?? null;
}

/** Highest version of a module id the caller can see (their own versions included, any status). */
async function latestVersion(userId: string, moduleId: string): Promise<string | null> {
  const { data, error } = await dataClient(userId).from("module_catalog_entries").select<{ version: string }>("version").eq("module_id", moduleId).limit(500);
  if (error) throw new Error("Could not read module versions");
  return data.map((row) => row.version).sort((left, right) => compareSemver(right, left))[0] ?? null;
}

/** The version to offer: the manifest's own, or the next patch after the newest one already in the registry. */
export async function suggestVersion(userId: string, manifest: ModuleManifest): Promise<string> {
  const latest = await latestVersion(userId, manifest.id);
  if (!latest || compareSemver(manifest.version, latest) > 0) return manifest.version;
  const [major, minor, patch] = latest.split(/[.+-]/).map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export type PublishInput = {
  version: string; author: string; visibility: RegistryVisibility; category: CatalogCard["category"];
  description: string; changelog: string; license: string;
};

export async function publishModuleVersion(access: ProjectAccess, base: ModuleManifest, input: PublishInput): Promise<{ error: PublishError; findings?: string[] } | { error: null; status: "published" | "pending_review"; moduleId: string; version: string }> {
  if (!(MODULE_LICENSES as readonly string[]).includes(input.license) || !(PUBLISH_CATEGORIES as readonly string[]).includes(input.category)
    || !["private", "organization", "public"].includes(input.visibility)
    || !input.description.trim() || input.description.length > 2000 || input.changelog.length > 4000) return { error: "invalid" };
  const parsed = moduleManifestSchema.safeParse({ ...base, version: input.version.trim(), author: { name: input.author.trim() } });
  if (!parsed.success) return { error: "invalid" };
  const manifest = parsed.data;
  const review = reviewModuleSubmission(manifest, { description: input.description, changelog: input.changelog });
  if (review.blocking.length) return { error: "blocked", findings: review.blocking.map((finding) => `${finding.code}:${finding.path}`) };
  const latest = await latestVersion(access.userId, manifest.id);
  if (latest && compareSemver(manifest.version, latest) <= 0) return { error: "version" };

  const { data: status, error } = await dataClient(access.userId).rpc<string>("submit_module_version", {
    p_module_id: manifest.id, p_version: manifest.version, p_visibility: input.visibility,
    p_organization_id: input.visibility === "organization" ? access.project.organization_id : null,
    p_category: input.category, p_description: input.description.trim(), p_changelog: input.changelog.trim(), p_license: input.license,
    p_manifest: hasDirectDatabase() ? JSON.stringify(manifest) : manifest, p_demo_records: hasDirectDatabase() ? "[]" : [],
  });
  if (error) {
    if (error.code === "23505") return { error: "exists" };
    if (error.code === "42501") return { error: /another publisher/.test(error.message) ? "taken" : "permission" };
    return { error: "failed" };
  }
  if (status === "published") await signPublishedVersion(manifest.id, manifest.version, access.userId);
  return { error: null, status: status === "published" ? "published" : "pending_review", moduleId: manifest.id, version: manifest.version };
}

/**
 * Signs a version once it is published (MODULE_SIGNING_KEY). Best effort:
 * an unsigned version still installs; a failed signature is logged.
 * Service role, because no authenticated role may write signatures.
 */
export async function signPublishedVersion(moduleId: string, version: string, actorId: string | null): Promise<void> {
  const key = moduleSigningKey();
  if (!key) return;
  const db = serviceDataClient();
  const { data, error } = await db.from("module_catalog_entries").select<CatalogRow>(CATALOG_COLUMNS).eq("module_id", moduleId).eq("version", version).maybeSingle();
  if (error || !data || data.status !== "published") return;
  // Signs the digest of the manifest as the app reads it, so a manifest
  // changed in the database later (with or without its digest column) fails.
  let digest: string;
  try { digest = decodeCatalogRow(data).digest; } catch { return; }
  const { signature, keyId } = signModuleVersion(key, moduleId, version, digest);
  const result = await db.from("module_catalog_entries").update({ signature, signing_key_id: keyId }).eq("module_id", moduleId).eq("version", version).is("signature", null).select("module_id");
  if (result.error) { console.error("[modules] could not sign", moduleId, version, result.error.message); return; }
  if (result.data.length) await db.from("module_registry_events").insert({ module_id: moduleId, version, actor_id: actorId, action: "signed" });
}

/** The caller's own versions with install/report counts (author dashboard). */
export async function getAuthorModules(userId: string): Promise<{ entry: CatalogEntry; installs: number; openReports: number }[]> {
  const db = dataClient(userId);
  const [counts, rows] = await Promise.all([
    db.rpcRows<{ module_id: string; version: string; installs: number | string; open_reports: number | string }>("module_install_counts"),
    db.from("module_catalog_entries").select<CatalogRow>(CATALOG_COLUMNS).eq("submitted_by", userId).order("module_id").limit(200),
  ]);
  if (counts.error || rows.error) throw new Error("Could not load your published modules. Apply migration 093 before deployment.");
  const byKey = new Map(counts.data.map((row) => [`${row.module_id}@${row.version}`, row]));
  // Versions of listings the caller co-owns through their organization are in counts but not submitted_by them.
  const own = rows.data.flatMap((row) => { try { return [decodeCatalogRow(row)]; } catch { return []; } });
  return own.map((entry) => {
    const count = byKey.get(`${entry.moduleId}@${entry.version}`);
    return { entry, installs: Number(count?.installs ?? 0), openReports: Number(count?.open_reports ?? 0) };
  }).sort((left, right) => left.entry.moduleId.localeCompare(right.entry.moduleId) || compareSemver(right.entry.version, left.entry.version));
}
