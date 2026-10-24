import type { ModuleManifest } from "./module-manifest";

export function hasExactModuleConsent(manifest: ModuleManifest, permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.length === manifest.permissions.length
    && new Set(permissions).size === permissions.length
    && manifest.permissions.every((permission) => permissions.includes(permission));
}

export type InstallRequest = { projectId: string; moduleId: string; version: string; permissions: unknown; expectedDigest: string };
export type InstallError = "permission" | "unsupported" | "consent" | "conflict" | "limit" | "saveFailed";
export type InstallResult = { error: InstallError } | { error: null; existing: boolean };
export interface ModuleInstallStore {
  getProject(projectId: string): Promise<{ organizationId: string; canManage: boolean } | null>;
  getEntry(moduleId: string, version: string): Promise<{ manifest: ModuleManifest; organizationId: string | null; compatible: boolean; digest: string } | null>;
  getExisting(projectId: string, moduleId: string): Promise<{ manifest: unknown } | null>;
  insert(projectId: string, manifest: ModuleManifest): Promise<"created" | "duplicate" | "limit" | "failed">;
}

/** Store operations run under the authenticated human; none use a service client. */
export async function installCatalogModule(request: InstallRequest, store: ModuleInstallStore): Promise<InstallResult> {
  try {
    const project = await store.getProject(request.projectId);
    if (!project?.canManage) return { error: "permission" };
    const entry = await store.getEntry(request.moduleId, request.version);
    if (!entry || (entry.organizationId && entry.organizationId !== project.organizationId)) return { error: "permission" };
    if (entry.manifest.id !== request.moduleId || entry.manifest.version !== request.version) return { error: "conflict" };
    if (!entry.compatible) return { error: "unsupported" };
    if (entry.digest !== request.expectedDigest) return { error: "conflict" };
    if (!hasExactModuleConsent(entry.manifest, request.permissions)) return { error: "consent" };
    const isSame = (existing: { manifest: unknown }) => JSON.stringify(existing.manifest) === JSON.stringify(entry.manifest);
    const existing = await store.getExisting(request.projectId, entry.manifest.id);
    if (existing) return isSame(existing) ? { error: null, existing: true } : { error: "conflict" };
    const inserted = await store.insert(request.projectId, entry.manifest);
    if (inserted === "created") return { error: null, existing: false };
    if (inserted === "duplicate" || inserted === "limit") {
      const raced = await store.getExisting(request.projectId, entry.manifest.id);
      if (raced && isSame(raced)) return { error: null, existing: true };
      return { error: !raced && inserted === "limit" ? "limit" : "conflict" };
    }
    return { error: "saveFailed" };
  } catch { return { error: "saveFailed" }; }
}
