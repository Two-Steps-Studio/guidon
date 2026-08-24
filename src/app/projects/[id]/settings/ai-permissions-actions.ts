"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";

export type AiPermissionsState = { error: string | null };

const PERMISSION_FIELDS = [
  "can_read_context",
  "can_create_comments",
  "can_change_status",
  "can_complete_tasks",
  "can_modify_settings",
  "can_delete_tasks",
] as const;

export async function updateAiPermissions(
  projectId: string,
  _prevState: AiPermissionsState,
  formData: FormData
): Promise<AiPermissionsState> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to change AI settings for this project." };
  }

  const values = PERMISSION_FIELDS.map((field) => formData.get(field) === "on");
  const allowAutoComplete = formData.get("allow_ai_auto_complete") === "on";

  if (hasDirectDatabase()) {
    await withUser(access.userId, ({ query }) =>
      query(
        `INSERT INTO project_ai_permissions (project_id, can_read_context, can_create_comments, can_change_status, can_complete_tasks, can_modify_settings, can_delete_tasks, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (project_id) DO UPDATE SET
           can_read_context = EXCLUDED.can_read_context,
           can_create_comments = EXCLUDED.can_create_comments,
           can_change_status = EXCLUDED.can_change_status,
           can_complete_tasks = EXCLUDED.can_complete_tasks,
           can_modify_settings = EXCLUDED.can_modify_settings,
           can_delete_tasks = EXCLUDED.can_delete_tasks,
           updated_at = now()`,
        [projectId, ...values]
      )
    );
    await withUser(access.userId, ({ query }) =>
      query("UPDATE projects SET allow_ai_auto_complete = $1 WHERE id = $2", [allowAutoComplete, projectId])
    );
  } else {
    const supabase = await createClient();

    const { error: permError } = await supabase.from("project_ai_permissions").upsert({
      project_id: projectId,
      can_read_context: values[0],
      can_create_comments: values[1],
      can_change_status: values[2],
      can_complete_tasks: values[3],
      can_modify_settings: values[4],
      can_delete_tasks: values[5],
      updated_at: new Date().toISOString(),
    });
    if (permError) return { error: permError.message };

    const { error: projError } = await supabase
      .from("projects")
      .update({ allow_ai_auto_complete: allowAutoComplete })
      .eq("id", projectId);
    if (projError) return { error: projError.message };
  }

  revalidatePath(`/projects/${projectId}/settings`);
  return { error: null };
}
