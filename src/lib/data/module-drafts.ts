import "server-only";
import { dataClient } from "@/lib/data-client";
import type { ProjectAccess } from "@/lib/data/project-access";
import { EMPTY_MODULE_DRAFT, parseModuleDraft } from "@/lib/work/module-draft";

export async function getModuleDraft(access: ProjectAccess) {
  const result = await dataClient(access.userId).from("project_module_drafts")
    .select<{ state: unknown; revision: number }>("state, revision").eq("project_id",access.project.id).eq("user_id",access.userId).maybeSingle();
  if (result.error) throw new Error("Could not load module draft. Apply migration 083 before deployment.");
  if (!result.data) return { state: EMPTY_MODULE_DRAFT, revision: 0 };
  try {
    return { state: parseModuleDraft(result.data.state), revision: result.data.revision };
  } catch {
    // A draft saved by an older builder may no longer validate. Start empty
    // but keep its revision, so the next save replaces it instead of failing
    // the modules page.
    console.warn("[modules] stored draft no longer validates; starting empty");
    return { state: EMPTY_MODULE_DRAFT, revision: result.data.revision };
  }
}
