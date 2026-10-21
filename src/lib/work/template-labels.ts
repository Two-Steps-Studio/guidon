import "server-only";

import { getTranslations } from "next-intl/server";
import { dataClient } from "@/lib/data-client";
import { LABEL_STARTER_SETS } from "@/lib/work/label-presets";
import type { ProjectTemplate } from "@/lib/work/project-modules";

/**
 * The template's labels, named in the creator's language. Runs after the
 * project exists (handle_new_project has made the creator owner, so the
 * owner/admin insert policy from 053 lets them in). A failure here doesn't
 * undo the project - labels are a convenience, and settings can add them.
 */
export async function addTemplateLabels(userId: string, projectId: string, template: ProjectTemplate) {
  const t = await getTranslations("settings");
  const db = dataClient(userId);
  let sortOrder = 0;
  for (const [key, color] of LABEL_STARTER_SETS[template]) {
    const name = t(`labelStarter.${template}.${key}` as Parameters<typeof t>[0]);
    const { error } = await db
      .from("project_label_presets")
      .insert({ project_id: projectId, name, color, sort_order: sortOrder++ });
    if (error) {
      console.error(`Template labels for project ${projectId} failed:`, error.message);
      return;
    }
  }
}
