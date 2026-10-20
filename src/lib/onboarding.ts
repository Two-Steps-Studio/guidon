import type { ProjectMethodology, ProjectType } from "@/types/project";
import { isProjectTemplate, type ProjectTemplate } from "@/lib/work/project-modules";

/**
 * The /start onboarding: a few questions answered BEFORE signing up, kept in
 * this browser (localStorage) until the account exists, then turned into an
 * organization and a first project by completeOnboarding (app/start/finish).
 * Shared by the wizard (client) and the action (server), so both validate
 * the same way.
 */

export const ONBOARDING_STORAGE_KEY = "guidon-onboarding";

export const ONBOARDING_PROJECT_TYPES = ["game", "website", "mobile_app", "api", "tool", "other"] as const satisfies readonly ProjectType[];
export const ONBOARDING_TEAM_SIZES = ["solo", "small", "studio"] as const;
export type OnboardingTeamSize = (typeof ONBOARDING_TEAM_SIZES)[number];

export interface OnboardingAnswers {
  projectType: ProjectType;
  projectName: string;
  /** Organization name; empty = "<project> team". */
  studioName: string;
  template: ProjectTemplate;
  methodology: ProjectMethodology;
  teamSize: OnboardingTeamSize;
}

/** A sensible template for what's being built - pre-selected, still changeable. */
export function defaultTemplateFor(type: ProjectType): ProjectTemplate {
  if (type === "game") return "gamedev";
  if (type === "website") return "design";
  return "software";
}

/** Answers as they came from storage or the client - anything off is null. */
export function parseOnboardingAnswers(value: unknown): OnboardingAnswers | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const projectName = typeof v.projectName === "string" ? v.projectName.trim().slice(0, 100) : "";
  const studioName = typeof v.studioName === "string" ? v.studioName.trim().slice(0, 100) : "";
  if (!projectName) return null;
  if (!(ONBOARDING_PROJECT_TYPES as readonly unknown[]).includes(v.projectType)) return null;
  if (typeof v.template !== "string" || !isProjectTemplate(v.template)) return null;
  if (v.methodology !== "standard" && v.methodology !== "scrum") return null;
  if (!(ONBOARDING_TEAM_SIZES as readonly unknown[]).includes(v.teamSize)) return null;
  return {
    projectType: v.projectType as ProjectType,
    projectName,
    studioName,
    template: v.template,
    methodology: v.methodology,
    teamSize: v.teamSize as OnboardingTeamSize,
  };
}

export function readStoredOnboarding(): OnboardingAnswers | null {
  try {
    return parseOnboardingAnswers(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function storeOnboarding(answers: OnboardingAnswers | null): void {
  try {
    if (answers) localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(answers));
    else localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // Storage blocked: the wizard still works within the page.
  }
}
