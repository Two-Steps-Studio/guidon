import "server-only";
import { dataClient } from "@/lib/data-client";
import { moduleManifestSchema } from "@/lib/work/module-manifest";
import { parseModuleRecords, parseModuleSettings, type InstalledModule } from "@/lib/work/module-records";

export const MODULE_PACKAGE_COLUMNS = "module_id, manifest, records, revision, enabled, installed, settings";

export type ModulePackageRow = {
  module_id: string;
  manifest: unknown;
  records: unknown;
  revision: number;
  enabled: boolean;
  installed: boolean;
  settings: unknown;
};

export function decodeModulePackage(row: ModulePackageRow): InstalledModule {
  const manifest = moduleManifestSchema.parse(row.manifest);
  if (manifest.id !== row.module_id) throw new Error("Invalid module identity");
  return {
    moduleId: row.module_id,
    manifest,
    records: parseModuleRecords(manifest, row.records),
    revision: row.revision,
    enabled: row.enabled,
    installed: row.installed,
    settings: parseModuleSettings(manifest, row.settings),
  };
}

export async function getModulePackages(userId: string, projectId: string): Promise<InstalledModule[]> {
  const { data, error } = await dataClient(userId).from("project_module_packages")
    .select<ModulePackageRow>(MODULE_PACKAGE_COLUMNS)
    .eq("project_id", projectId).order("module_id").limit(20);
  if (error) throw new Error("Could not load module packages. Apply migrations 080 and 082 before deployment.");
  return data.map(decodeModulePackage);
}
