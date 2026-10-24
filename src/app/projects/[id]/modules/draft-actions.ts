"use server";
import { dataClient } from "@/lib/data-client";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { parseModuleDraft } from "@/lib/work/module-draft";

export async function saveProjectModuleDraft(projectId: string, input: unknown, revision: number): Promise<{ error: "permission" | "invalid" | "conflict" | "saveFailed" } | { error: null; revision: number }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) return { error: "permission" };
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= 2147483647) return { error: "invalid" };
  let state;
  try { state = parseModuleDraft(input); } catch { return { error: "invalid" }; }
  const db = dataClient(access.userId).from("project_module_drafts");
  const result = revision === 0
    ? await db.insert({ project_id: projectId, user_id: access.userId, state, revision: 1 }).select("revision")
    : await db.update({ state, revision: revision + 1, updated_at: new Date().toISOString() }).eq("project_id",projectId).eq("user_id",access.userId).eq("revision",revision).select("revision");
  if (result.error) return { error: result.error.code === "23505" ? "conflict" : "saveFailed" };
  return result.data.length ? { error: null, revision: revision + 1 } : { error: "conflict" };
}
