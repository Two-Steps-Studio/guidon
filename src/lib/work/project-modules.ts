// No server-only imports: used by the sidebar, the project overview and settings.

/**
 * Project sections a team can hide (migration 055). Stored as the list of
 * DISABLED modules on projects.disabled_modules, so an empty list - every
 * existing project - shows everything, and a module added later is visible
 * by default. Hiding is about navigation, not access: the pages and their
 * data stay reachable by direct link and come back unchanged when re-enabled.
 *
 * The values are the route segments under /projects/[id]/ and must match
 * the CHECK constraint (055, widened to the task board in 058; test:db
 * section 44 compares them). Overview, members, activity and settings are
 * never modules.
 */
export const PROJECT_MODULES = [
  "work",
  "calendar",
  "roadmap",
  "files",
  "knowledge",
  "decisions",
  "references",
  "technology",
  "memory",
  "context",
] as const;

export type ProjectModule = (typeof PROJECT_MODULES)[number];

export function isProjectModule(value: string): value is ProjectModule {
  return (PROJECT_MODULES as readonly string[]).includes(value);
}

/** Drops unknown values and duplicates, keeps PROJECT_MODULES order. */
export function normalizeDisabledModules(values: readonly string[] | null | undefined): ProjectModule[] {
  const set = new Set(values ?? []);
  return PROJECT_MODULES.filter((module) => set.has(module));
}

/** Nav hrefs that aren't modules (overview "", work, members...) are always shown. */
export function isModuleVisible(href: string, disabled: readonly string[] | null | undefined): boolean {
  return !isProjectModule(href) || !(disabled ?? []).includes(href);
}

/**
 * Project templates offered when creating a project: which modules start
 * hidden, plus the label starter set of the same name (LABEL_STARTER_SETS
 * in label-presets.ts). Both stay editable in project settings afterwards;
 * a template only picks the starting point.
 */
export const PROJECT_TEMPLATES = {
  software: { disabledModules: ["references"] },
  gamedev: { disabledModules: [] },
  design: { disabledModules: ["technology"] },
  marketing: { disabledModules: ["technology", "context"] },
  support: { disabledModules: ["roadmap", "references", "technology", "context", "memory"] },
} as const satisfies Record<string, { disabledModules: readonly ProjectModule[] }>;

export type ProjectTemplate = keyof typeof PROJECT_TEMPLATES;

export function isProjectTemplate(value: string): value is ProjectTemplate {
  return Object.prototype.hasOwnProperty.call(PROJECT_TEMPLATES, value);
}
