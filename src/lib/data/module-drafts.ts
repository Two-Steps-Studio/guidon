import "server-only";
import { dataClient } from "@/lib/data-client";
import type { ProjectAccess } from "@/lib/data/project-access";
import { EMPTY_MODULE_DRAFT, parseModuleDraft } from "@/lib/work/module-draft";

export async function getModuleDraft(access: ProjectAccess) {
  const result = await dataClient(access.userId).from("project_module_drafts")
    .select<{ state: unknown; revision: number }>("state, revision").eq("project_id",access.project.id).eq("user_id",access.userId).maybeSingle();
  if (result.error) throw new Error("Could not load module draft. Apply migration 083 before deployment.");
  return result.data ? { state: parseModuleDraft(result.data.state), revision: result.data.revision } : { state: EMPTY_MODULE_DRAFT, revision: 0 };
}
