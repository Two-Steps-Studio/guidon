import "server-only";
import { dataClient } from "@/lib/data-client";
import { customModulesSchema } from "@/lib/work/custom-modules";
import { moduleManifestSchema } from "@/lib/work/module-manifest";

export type ProjectModuleLink = { id: string; name: string; href: string };

/** Read with the caller's RLS identity; never send module records to the sidebar. */
export async function getProjectModuleLinks(userId: string, projectId: string): Promise<ProjectModuleLink[]> {
  const [legacy, packages] = await Promise.all([
    dataClient(userId).from("projects").select<{ custom_modules: unknown }>("custom_modules").eq("id", projectId).single(),
    dataClient(userId).from("project_module_packages").select<{ module_id: string; manifest: unknown }>("module_id, manifest").eq("project_id", projectId).eq("enabled", true).eq("installed", true).order("module_id").limit(20),
  ]);
  if (legacy.error || !legacy.data) throw new Error("Could not load project module navigation");
  if (packages.error) throw new Error("Could not load installed module navigation");
  const content = customModulesSchema.parse(legacy.data.custom_modules);
  return [
    ...content.map(module => ({ id: `content-${module.id}`, name: module.title, href: `/projects/${projectId}/extensions/content/${module.id}` })),
    ...packages.data.map(module => ({ ...module, manifest: moduleManifestSchema.parse(module.manifest) }))
      .filter(module => module.manifest.permissions.includes("module-data:read"))
      .map(module => ({ id: `package-${module.module_id}`, name: module.manifest.name, href: `/projects/${projectId}/extensions/package/${module.module_id}` })),
  ];
}
