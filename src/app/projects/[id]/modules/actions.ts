"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { customModulesSchema } from "@/lib/work/custom-modules";

export async function saveCustomModules(projectId: string, input: unknown, revision: number) {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: "permission" as const };
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647) return { error: "invalid" as const };
  const parsed = customModulesSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };
  const { data, error } = await dataClient(access.userId).from("projects")
    // pg encodes JS arrays as PostgreSQL arrays; a JSONB array needs JSON text.
    .update({ custom_modules: hasDirectDatabase() ? JSON.stringify(parsed.data) : parsed.data, custom_modules_revision: revision + 1 })
    .eq("id", projectId).eq("custom_modules_revision", revision).select("id");
  if (error) return { error: "saveFailed" as const };
  if (!data.length) return { error: "conflict" as const };
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, revision: revision + 1 };
}
