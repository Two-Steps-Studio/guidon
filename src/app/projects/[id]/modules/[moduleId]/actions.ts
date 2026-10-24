"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getManagedModule } from "@/lib/data/module-manager";
import { getCatalogEntry } from "@/lib/data/module-catalog";
import { dataClient } from "@/lib/data-client";
import { prepareModuleChange } from "@/lib/work/module-lifecycle";

export async function manageModule(projectId: string, moduleId: string, formData: FormData) {
  const context = await getManagedModule(projectId, moduleId);
  if (!context) redirect("/projects");
  const path = `/projects/${projectId}/modules/${moduleId}`;
  function fail(error: string): never { return redirect(`${path}?error=${error}`); }
  const { current, access } = context;
  let candidate = null;
  if (formData.get("command") === "replace") {
    const version = formData.get("targetVersion");
    if (typeof version !== "string" || version.length > 128) fail("invalid");
    candidate = await getCatalogEntry(access.userId, moduleId, version);
  }
  const change = prepareModuleChange(current, context.digest, access.project.organization_id, formData, candidate);
  if (change.error) fail(change.error);
  const result = await dataClient(access.userId).from("project_module_packages").update(change.patch).eq("project_id", projectId).eq("module_id", moduleId).eq("revision", current.revision).select("module_id");
  if (result.error) fail("saveFailed");
  if (!result.data.length) fail("conflict");
  revalidatePath(`/projects/${projectId}/modules`); revalidatePath("/my-modules"); revalidatePath(path);
  redirect(`${path}?saved=1`);
}
