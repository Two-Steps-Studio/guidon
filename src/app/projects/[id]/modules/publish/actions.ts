"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { getCurrentUser } from "@/lib/data/current-user";
import { loadPublishSource, publishModuleVersion, type PublishError, type PublishSource } from "@/lib/data/module-registry";
import type { RegistryVisibility } from "@/lib/data/module-catalog";
import type { CatalogCard } from "@/lib/work/module-catalog";

export type PublishState = { error: PublishError | null; findings?: string[]; done?: { status: "published" | "pending_review"; moduleId: string; version: string } };

const text = (form: FormData, name: string) => { const value = form.get(name); return typeof value === "string" ? value : ""; };

export async function publishModule(projectId: string, source: PublishSource, _state: PublishState, form: FormData): Promise<PublishState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: "permission" };
  const base = await loadPublishSource(access, source);
  if (!base) return { error: "noManifest" };
  const user = await getCurrentUser();
  const result = await publishModuleVersion(access, base, {
    version: text(form, "version"),
    author: text(form, "author") || user.full_name || user.email || "",
    visibility: text(form, "visibility") as RegistryVisibility,
    category: text(form, "category") as CatalogCard["category"],
    description: text(form, "description"), changelog: text(form, "changelog"), license: text(form, "license"),
  });
  if (result.error) return { error: result.error, findings: result.findings };
  revalidatePath("/marketplace"); revalidatePath("/my-modules");
  return { error: null, done: { status: result.status, moduleId: result.moduleId, version: result.version } };
}
