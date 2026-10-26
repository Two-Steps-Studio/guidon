import { compareSemver, type ModuleManifest } from "./module-manifest";
import { MODULE_ENGINE_VERSION, parseModuleRecords, parseModuleSettings, unsupportedModulePermissions, type InstalledModule } from "./module-records";
import { hasExactModuleConsent } from "./module-installation";

type Release = { manifest: ModuleManifest; digest: string; organizationId: string | null };
type Patch = { revision: number; installed?: boolean; enabled?: boolean; settings?: InstalledModule["settings"]; manifest?: ModuleManifest };
export type LifecycleError = "conflict" | "unsupported" | "consent" | "invalid" | "permission" | "incompatibleData";

function supported(manifest: ModuleManifest) {
  return !unsupportedModulePermissions(manifest).length
    && compareSemver(MODULE_ENGINE_VERSION, manifest.engine.minVersion) >= 0
    && (!manifest.engine.maxVersionExclusive || compareSemver(MODULE_ENGINE_VERSION, manifest.engine.maxVersionExclusive) < 0);
}

// Called only after project authorization and a caller-scoped catalog lookup.
// The returned patch never contains records or package identity columns.
export function prepareModuleChange(current: InstalledModule, digest: string, organizationId: string, form: FormData, release: Release | null = null): { error: LifecycleError } | { error: null; patch: Patch } {
  const revision = form.get("revision");
  if (typeof revision !== "string" || !/^\d{1,10}$/.test(revision) || Number(revision) !== current.revision || Number(revision) >= 2147483647) return { error: "conflict" };
  const command = form.get("command");
  const patch: Patch = { revision: current.revision + 1 };
  if (command === "uninstall") { patch.installed = false; patch.enabled = false; }
  else if (command === "disable") {
    if (!current.installed) return { error: "conflict" };
    patch.enabled = false;
  } else if (command === "enable" || command === "restore") {
    if (!supported(current.manifest)) return { error: "unsupported" };
    if (command === "enable" && !current.installed) return { error: "conflict" };
    if (command === "restore" && (form.get("approve") !== "on" || form.get("digest") !== digest || !hasExactModuleConsent(current.manifest, form.getAll("permissions")))) return { error: "consent" };
    patch.installed = true; patch.enabled = true;
  } else if (command === "settings") {
    const view = form.get("defaultView");
    const category = typeof form.get("category") === "string" ? (form.get("category") as string).trim() : "";
    try { patch.settings = parseModuleSettings(current.manifest, { ...(view ? { defaultView: view } : {}), ...(category ? { category } : {}) }); } catch { return { error: "invalid" }; }
  } else if (command === "replace") {
    if (!current.installed) return { error: "conflict" };
    if (!release || release.manifest.id !== current.moduleId || (release.organizationId && release.organizationId !== organizationId)) return { error: "permission" };
    if (release.manifest.version !== form.get("targetVersion")) return { error: "conflict" };
    if (!supported(release.manifest)) return { error: "unsupported" };
    if (release.digest !== form.get("digest") || compareSemver(release.manifest.version, current.manifest.version) === 0) return { error: "conflict" };
    if (form.get("approve") !== "on" || !hasExactModuleConsent(release.manifest, form.getAll("permissions"))) return { error: "consent" };
    try { parseModuleRecords(release.manifest, current.records); } catch { return { error: "incompatibleData" }; }
    patch.manifest = release.manifest;
    // The category is the project's choice and survives a version change; the
    // default view only if the new version still has it.
    const { category, defaultView } = current.settings;
    patch.settings = { ...(release.manifest.views.some((view) => view.id === defaultView) ? { defaultView } : {}), ...(category ? { category } : {}) };
  } else return { error: "invalid" };
  return { error: null, patch };
}
