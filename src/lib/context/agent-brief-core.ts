/**
 * Agent brief: a short, versioned Markdown document a project's owners and
 * admins approve for AI agents - purpose, stack, conventions, constraints
 * and what agents may do. Generated from what Guidon already holds (project,
 * technologies, memory, decisions, AI permissions), edited by a person,
 * then saved as an immutable numbered version (agent_briefs, migration 102).
 *
 * Every claim carries its source as `_[kind id]_`; one that has none - a
 * line a person typed, or memory nobody verified - is marked as such
 * instead. Pure - tests/context-pack.test.mjs covers it.
 */

export const BRIEF_MAX_CHARS = 20000;

export type BriefMemory = { id: string; content: string; memory_type: string; verified: boolean };
export type BriefInput = {
  project: { id: string; name: string; description: string | null };
  technologies: { id: string; name: string; version: string | null; category: string }[];
  memory: BriefMemory[];
  decisions: { id: string; title: string; status: string }[];
  ai: {
    enabled: boolean;
    allowAutoComplete: boolean;
    permissions: Partial<Record<(typeof PERMISSION_LINES)[number][0], boolean>> | null;
  };
};

/** Defaults of project_ai_permissions (016) for a project with no row yet. */
const PERMISSION_DEFAULTS = {
  can_read_context: true,
  can_create_comments: true,
  can_change_status: true,
  can_complete_tasks: false,
  can_modify_settings: false,
  can_delete_tasks: false,
} as const;

const PERMISSION_LINES = [
  ["can_read_context", "Read the project's context (decisions, knowledge, memory)"],
  ["can_create_comments", "Comment on tasks"],
  ["can_change_status", "Move tasks between columns"],
  ["can_complete_tasks", "Mark tasks done"],
  ["can_modify_settings", "Change project settings and modules"],
  ["can_delete_tasks", "Delete tasks"],
] as const;

const short = (id: string) => id.slice(0, 8);
const oneLine = (text: string, max = 300) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const ref = (kind: string, id: string) => `_[${kind} ${short(id)}]_`;
const UNVERIFIED = "_[unverified - check before relying on it]_";

/** The draft a person edits before approving. Lines are claims; each says where it came from. */
export function generateBrief(input: BriefInput): string {
  const memoryOf = (...types: string[]) => input.memory.filter((row) => types.includes(row.memory_type));
  const memoryLine = (row: BriefMemory) => `- ${oneLine(row.content)} ${ref("memory", row.id)}${row.verified ? "" : ` ${UNVERIFIED}`}`;
  const section = (title: string, lines: string[], empty: string) => [`## ${title}`, "", ...(lines.length ? lines : [`- ${empty} _[no source]_`]), ""];

  const description = input.project.description?.trim();
  const facts = memoryOf("fact").filter((row) => row.verified);
  const perms = { ...PERMISSION_DEFAULTS, ...(input.ai.permissions ?? {}) };

  return [
    `# Agent brief: ${oneLine(input.project.name, 120)}`,
    "",
    "Written for AI agents working on this project. Every line names its source in `_[...]_`; a line marked unverified or without a source is not established fact.",
    "",
    ...section("Purpose", description ? [`- ${oneLine(description, 600)} ${ref("project", input.project.id)}`] : [], "No project description yet - add one in the project's settings."),
    ...section(
      "Stack",
      input.technologies.map((tech) => `- ${oneLine(tech.name, 80)}${tech.version ? ` ${oneLine(tech.version, 30)}` : ""} (${tech.category}) ${ref("technology", tech.id)}`),
      "No technologies recorded - add them on the Technologies page."
    ),
    ...section(
      "Conventions",
      [
        ...memoryOf("project_rule", "preference").map(memoryLine),
        ...input.decisions.filter((decision) => decision.status === "approved").map((decision) => `- ${oneLine(decision.title)} ${ref("decision", decision.id)}`),
        ...facts.map(memoryLine),
      ],
      "No rules, approved decisions or verified facts yet."
    ),
    ...section("Constraints", memoryOf("constraint").map(memoryLine), "No constraints recorded."),
    ...section(
      "Allowed actions",
      input.ai.enabled
        ? PERMISSION_LINES.map(([key, label]) => {
            const allowed = key === "can_complete_tasks" ? perms[key] && input.ai.allowAutoComplete : perms[key];
            return `- ${allowed ? "Allowed" : "Not allowed"}: ${label} _[setting AI permissions]_`;
          })
        : ["- AI features are turned off for this project - agents can't use it. _[setting AI features]_"],
      "No AI permission settings."
    ),
  ].join("\n").trimEnd() + "\n";
}

/**
 * Before a version is saved: every list item without a source gets one
 * saying who added it, so a typed-in claim is never mistaken for one backed
 * by the project's data.
 */
export function markUnsourcedClaims(markdown: string, version: number): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (/^\s*[-*]\s+\S/.test(line) && !/_\[[^\]]+\]_/.test(line) ? `${line.trimEnd()} _[added by hand in v${version}]_` : line))
    .join("\n");
}

/** Claims and how many of them have no source in the project's data. */
export function briefStats(markdown: string): { claims: number; unsourced: number; unverified: number } {
  const lines = markdown.split("\n").filter((line) => /^\s*[-*]\s+\S/.test(line));
  return {
    claims: lines.length,
    unsourced: lines.filter((line) => /_\[(no source|added by hand[^\]]*)\]_/.test(line)).length,
    unverified: lines.filter((line) => line.includes(UNVERIFIED)).length,
  };
}
