import "server-only";
import { dataClient } from "@/lib/data-client";
import { moduleManifestSchema } from "@/lib/work/module-manifest";
import { moduleCategorySchema } from "@/lib/work/module-records";

export type ProjectModuleLink = { id: string; name: string; href: string; category?: string };

/** Read with the caller's RLS identity; never send module records to the sidebar. */
export async function getProjectModuleLinks(userId: string, projectId: string): Promise<ProjectModuleLink[]> {
  const packages = await dataClient(userId).from("project_module_packages").select<{ module_id: string; manifest: unknown; settings: unknown }>("module_id, manifest, settings").eq("project_id", projectId).eq("enabled", true).eq("installed", true).order("module_id").limit(20);
  if (packages.error) throw new Error("Could not load installed module navigation");
  // This feeds the layout of every project page: a module row the app can't
  // read (written straight through the API, or from an older schema) is left
  // out of the navigation instead of breaking the whole project.
  const links: ProjectModuleLink[] = [];
  for (const row of packages.data) {
    const manifest = moduleManifestSchema.safeParse(row.manifest);
    if (!manifest.success || manifest.data.id !== row.module_id || !manifest.data.permissions.includes("module-data:read")) continue;
    const category = moduleCategorySchema.safeParse((row.settings as { category?: unknown } | null)?.category);
    links.push({ id: `package-${row.module_id}`, name: manifest.data.name, href: `/projects/${projectId}/extensions/package/${row.module_id}`, category: category.success ? category.data : undefined });
  }
  return links;
}
