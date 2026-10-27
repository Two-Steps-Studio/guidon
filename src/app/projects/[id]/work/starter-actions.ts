"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { hostedTaskLimitError } from "@/lib/limits";
import type { Task } from "@/types/task";
import { tr } from "@/lib/i18n/server-errors";

const STARTER_TASKS = ["memory", "plan", "improve"] as const;

/**
 * "Add starter tasks for your agent" on a new project's board: three small
 * tasks any connected agent can do in any repository - each one shows a
 * different part of Guidon (project memory, creating tasks, attempts and
 * review) - plus one project rule, so the first run produces something to
 * look at within minutes. Written in the person's language, as them, under
 * RLS (tasks_insert / project_memory_insert: owner/admin/developer). Nothing
 * is added on its own: this only runs from the button.
 */
export async function addAgentStarterTasks(projectId: string): Promise<{ tasks: Task[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return { tasks: [], error: await tr("You do not have permission to create tasks.") };
  }
  const t = await getTranslations("onboarding");
  const db = dataClient(access.userId);

  // A second click (or a second tab) doesn't add a second set.
  const firstTitle = t("starterTask_memory_title");
  const { data: existing } = await db.from<{ id: string }>("tasks").select("id").eq("project_id", projectId).eq("title", firstTitle).limit(1);
  if (existing && existing.length > 0) return { tasks: [], error: await tr("The starter tasks are already on this board.") };

  const tasks: Task[] = [];
  for (const [index, key] of STARTER_TASKS.entries()) {
    const limitError = await hostedTaskLimitError(projectId, access.project.organization_id);
    if (limitError) return { tasks, error: limitError };
    const { data: task, error } = await db
      .from<Task>("tasks")
      .insert({
        project_id: projectId,
        title: t(`starterTask_${key}_title`),
        description: t(`starterTask_${key}_description`),
        status: "todo",
        priority: index === 0 ? "high" : "medium",
        tags: ["agent"],
        created_by: access.userId,
        sort_order: index,
      })
      .select("*")
      .single();
    if (error || !task) return { tasks, error: error?.message ?? (await tr("Could not create the starter tasks. Try again.")) };
    tasks.push(task);
    await logActivity({
      userId: access.userId,
      action: "task_created",
      projectId,
      entityType: "task",
      entityId: task.id,
      details: { title: task.title, via: "agent_starter" },
    });
  }

  // The rule is a nice-to-have: the tasks are what matter, so a failure here
  // (e.g. the memory module's table missing on an old self-hosted schema)
  // isn't reported as one.
  const { error: memoryError } = await db.from("project_memory").insert({
    project_id: projectId,
    content: t("starterRule"),
    memory_type: "project_rule",
    created_by: access.userId,
  });
  if (memoryError) console.error("Starter project rule was not added:", memoryError.message);

  revalidatePath(`/projects/${projectId}/work`);
  return { tasks, error: null };
}
