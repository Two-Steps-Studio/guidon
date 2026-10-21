"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";
import { logActivity } from "@/lib/data/log-activity";
import { getUniqueProjectSlug } from "@/lib/data/project-slug";
import { slugify } from "@/lib/slug";
import { parseOnboardingAnswers } from "@/lib/onboarding";
import { PROJECT_TEMPLATES } from "@/lib/work/project-modules";
import { addTemplateLabels } from "@/lib/work/template-labels";
import { tr } from "@/lib/i18n/server-errors";

/**
 * The end of /start: the answers given before signing up become the new
 * account's organization and first project (with the chosen template's
 * modules and labels), as the now signed-in user - RLS and the usual
 * triggers (creator = owner) apply exactly as for the regular dialogs.
 */
export async function completeOnboarding(raw: unknown): Promise<{ projectId: string | null; error: string | null }> {
  const answers = parseOnboardingAnswers(raw);
  if (!answers) return { projectId: null, error: await tr("Something is missing - go back and fill in the steps.") };

  const user = await getCurrentUser();
  const db = dataClient(user.id);

  const orgName = answers.studioName || `${answers.projectName} team`;
  // Slugs are unique; a taken one gets a short random suffix.
  let organizationId: string | null = null;
  for (const slug of [slugify(orgName, "studio"), `${slugify(orgName, "studio")}-${Math.random().toString(36).slice(2, 6)}`]) {
    const { data, error } = await db
      .from<{ id: string }>("organizations")
      .insert({ name: orgName, slug, created_by: user.id })
      .select("id")
      .single();
    if (data) {
      organizationId = data.id;
      break;
    }
    if (error && error.code !== "23505") return { projectId: null, error: error.message };
  }
  if (!organizationId) return { projectId: null, error: await tr("Could not create your workspace. Try again.") };

  const { slug } = await getUniqueProjectSlug(organizationId, user.id, answers.projectName);
  const { data: project, error } = await db
    .from<{ id: string }>("projects")
    .insert({
      organization_id: organizationId,
      name: answers.projectName,
      slug,
      project_type: answers.projectType,
      methodology: answers.methodology,
      disabled_modules: [...PROJECT_TEMPLATES[answers.template].disabledModules],
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !project) return { projectId: null, error: error?.message ?? (await tr("Could not create your workspace. Try again.")) };

  await addTemplateLabels(user.id, project.id, answers.template);
  await logActivity({
    userId: user.id,
    action: "project_created",
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    details: { name: answers.projectName, via: "onboarding" },
  });

  revalidatePath("/dashboard");
  return { projectId: project.id, error: null };
}
