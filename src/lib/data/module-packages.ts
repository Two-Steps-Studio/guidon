import "server-only";
import { dataClient } from "@/lib/data-client";
import { moduleManifestSchema } from "@/lib/work/module-manifest";
import { parseModuleRecords, type InstalledModule } from "@/lib/work/module-records";

export type ModulePackageRow = {
  module_id: string;
  manifest: unknown;
  records: unknown;
  revision: number;
  enabled: boolean;
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
  };
}

export async function getModulePackages(userId: string, projectId: string): Promise<InstalledModule[]> {
  const { data, error } = await dataClient(userId).from("project_module_packages")
    .select<ModulePackageRow>("module_id, manifest, records, revision, enabled")
    .eq("project_id", projectId).order("module_id").limit(20);
  if (error) throw new Error("Could not load module packages. Apply migration 080 before deployment.");
  return data.map(decodeModulePackage);
}
