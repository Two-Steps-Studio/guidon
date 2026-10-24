"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/current-user";
import { getCatalogEntry } from "@/lib/data/module-catalog";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { moduleManifestSchema } from "@/lib/work/module-manifest";
import { installCatalogModule } from "@/lib/work/module-installation";

export async function installFromCatalog(moduleId: string, version: string, formData: FormData) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(moduleId) || !/^[0-9A-Za-z.+-]{1,128}$/.test(version)) redirect("/marketplace");
  const path = `/marketplace/${encodeURIComponent(moduleId)}/${encodeURIComponent(version)}/install`;
  const projectId = z.uuid().safeParse(formData.get("projectId"));
  if (!projectId.success) redirect(`${path}?error=permission`);
  const user = await getCurrentUser();
  const db = dataClient(user.id);
  const result = await installCatalogModule({
    projectId: projectId.data, moduleId, version,
    expectedDigest: typeof formData.get("digest") === "string" ? formData.get("digest") as string : "",
    permissions: formData.get("approve") === "on" ? formData.getAll("permissions") : null,
  }, {
    async getProject(id) {
      const access = await getProjectAccess(id);
      return access ? { organizationId: access.project.organization_id, canManage: canManageProject(access.role) } : null;
    },
    async getEntry(id, release) { return getCatalogEntry(user.id, id, release); },
    async getExisting(id, name) {
      const current = await db.from("project_module_packages").select<{ manifest: unknown }>("manifest").eq("project_id", id).eq("module_id", name).maybeSingle();
      if (current.error) throw new Error("Could not check module installation");
      if (!current.data) return null;
      const parsed = moduleManifestSchema.safeParse(current.data.manifest);
      return { manifest: parsed.success ? parsed.data : null };
    },
    async insert(id, manifest) {
      // One INSERT stores the whole installation. RLS rechecks project access
      // even if membership changed since the page/action access check.
      const { error } = await db.from("project_module_packages").insert({ project_id: id, module_id: manifest.id, manifest });
      return !error ? "created" : error.code === "23505" ? "duplicate" : error.code === "23514" ? "limit" : "failed";
    },
  });
  if (result.error) redirect(`${path}?error=${result.error}`);
  revalidatePath(`/projects/${projectId.data}/modules`);
  revalidatePath("/my-modules");
  redirect(`/projects/${projectId.data}/modules#module-${encodeURIComponent(moduleId)}`);
}
