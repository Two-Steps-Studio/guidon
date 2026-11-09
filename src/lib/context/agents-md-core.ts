/**
 * AGENTS.md export: what a project's agents should know, as one file a
 * repository can keep (AGENTS.md is read by Codex, Cursor, Claude Code and
 * others). The approved brief, the facts a person verified that the brief
 * doesn't already cite, and the known dead ends - approaches that failed
 * on this project, so an agent without Guidon access still won't repeat
 * them. Pure - tests/context-pack.test.mjs covers it.
 */

export type AgentsMdInput = {
  project: { id: string; name: string };
  siteUrl: string;
  generatedAt: Date;
  brief: { version: number; content: string } | null;
  facts: { id: string; content: string; verified_at: string | null }[];
  deadEnds: { id: string; task_title: string; approach: string; outcome: string; failure_reason: string | null }[];
};

const short = (id: string) => id.slice(0, 8);
const oneLine = (text: string, max = 300) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

export function generateAgentsMd(input: AgentsMdInput): string {
  const projectUrl = `${input.siteUrl}/projects/${input.project.id}`;
  // A fact the approved brief already cites (`_[memory abcd1234]_`) isn't repeated.
  const facts = input.facts.filter((fact) => !input.brief?.content.includes(`_[memory ${short(fact.id)}]_`));
  const brief = input.brief
    ? // The brief is a document of its own; its headings move one level down under this file's title.
      input.brief.content.trim().replace(/^(#{1,5}) /gm, "#$1 ")
    : `No approved agent brief yet - a project owner or admin can approve one at ${projectUrl}/brief.`;

  return [
    `# AGENTS.md - ${oneLine(input.project.name, 120)}`,
    "",
    `> Exported from Guidon (${projectUrl}) on ${input.generatedAt.toISOString().slice(0, 10)}. Change it there and export again - edits here are overwritten.`,
    "",
    input.brief ? `## Agent brief (v${input.brief.version})` : "## Agent brief",
    "",
    brief,
    "",
    "## Verified facts",
    "",
    ...(facts.length
      ? facts.map((fact) => `- ${oneLine(fact.content)} _[memory ${short(fact.id)}${fact.verified_at ? `, verified ${fact.verified_at.slice(0, 10)}` : ""}]_`)
      : ["- None beyond the brief yet."]),
    "",
    "## Known dead ends",
    "",
    "Approaches already tried on this project that failed or only partly worked. Don't repeat one without a new reason.",
    "",
    ...(input.deadEnds.length
      ? input.deadEnds.map(
          (attempt) =>
            `- **${oneLine(attempt.task_title, 120)}**: ${oneLine(attempt.approach, 200)} - ${attempt.outcome}${attempt.failure_reason ? `: ${oneLine(attempt.failure_reason, 200)}` : ""} _[attempt ${short(attempt.id)}]_`
        )
      : ["- None recorded yet."]),
    "",
  ].join("\n");
}
