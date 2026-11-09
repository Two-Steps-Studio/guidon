/**
 * "Guidon vs X" pages (src/app/compare). One entry per tool: who should pick
 * which, a topic-by-topic table and how to switch. Claims about other tools
 * stay to what their own sites state and are dated (CHECKED); where the other
 * tool is better, the table says so - a comparison nobody trusts sells nothing.
 * Pure: the pages and the sitemap read it.
 */

export const CHECKED = "2026-11-09";

/** Who wins a row: shown as "Better:" on that side. */
type Edge = "guidon" | "them" | null;
export type CompareRow = { topic: string; guidon: string; them: string; better: Edge };

export type Comparison = {
  slug: string;
  name: string;
  /** "Guidon vs Jira: <angle>" - the page title. */
  angle: string;
  /** One line for the index card and the meta description. */
  summary: string;
  url: string;
  shortAnswer: string;
  chooseGuidon: string[];
  chooseThem: string[];
  /** Rows specific to this tool, shown after the shared ones. */
  rows: CompareRow[];
  /** Overrides of the shared rows, by topic. */
  overrides?: Partial<Record<SharedTopic, Pick<CompareRow, "them" | "better">>>;
  switching: string;
  faq: { q: string; a: string }[];
};

const SHARED = {
  deadEnds: {
    topic: "What was already tried",
    guidon: "Better: attempts are part of every task - approach, outcome and why it failed. An agent starting the task gets the dead ends with start_task, and is reminded to record its own.",
  },
  verified: {
    topic: "Verified vs AI-guessed knowledge",
    guidon: "Better: project memory keeps what a person verified apart from what an AI wrote; anything an agent adds or changes waits in a review queue.",
  },
  agentsMd: {
    topic: "Context in your repository",
    guidon: "Better: export the project as AGENTS.md - approved brief, verified facts, known dead ends - for Claude Code, Codex and Cursor.",
  },
  selfHosted: {
    topic: "Self-hosting",
    guidon: "Docker Compose with plain PostgreSQL; every feature, no plan limits on your own install.",
  },
  mcp: {
    topic: "AI agents (MCP)",
    guidon: "MCP server and REST API; works with Claude, ChatGPT, Cursor, Codex and any MCP client. You bring the AI - no AI credits.",
  },
  source: {
    topic: "Source code",
    guidon: "Public on GitHub (the application licence is still being settled).",
  },
} as const;
type SharedTopic = keyof typeof SHARED;

const NO_ATTEMPTS = "No built-in record of failed attempts; it lives in comments, if anywhere.";
const NO_VERIFIED = "No separate status for verified versus AI-written knowledge.";
const NO_AGENTS_MD = "No AGENTS.md export.";
const CLOUD_ONLY = "Cloud only.";
const CLOSED = "Closed source.";

function sharedRows(c: Comparison): CompareRow[] {
  const them: Record<SharedTopic, string> = {
    deadEnds: NO_ATTEMPTS,
    verified: NO_VERIFIED,
    agentsMd: NO_AGENTS_MD,
    selfHosted: CLOUD_ONLY,
    mcp: "See below.",
    source: CLOSED,
  };
  const edge: Record<SharedTopic, Edge> = { deadEnds: "guidon", verified: "guidon", agentsMd: "guidon", selfHosted: "guidon", mcp: null, source: "guidon" };
  return (Object.keys(SHARED) as SharedTopic[]).map((key) => ({
    topic: SHARED[key].topic,
    guidon: SHARED[key].guidon,
    them: c.overrides?.[key]?.them ?? them[key],
    better: c.overrides?.[key] ? c.overrides[key]!.better : edge[key],
  }));
}

/** Every row of a comparison, shared topics first; the MCP row is replaced by the tool's own when it has one. */
export function comparisonRows(c: Comparison): CompareRow[] {
  return [...sharedRows(c), ...c.rows];
}

const IMPORT = (from: string) =>
  `Export your ${from} tasks to CSV and use **Import** on a Guidon board: titles, descriptions, statuses, priorities, labels, assignees and due dates are matched to your columns, with a preview of anything that doesn't match. Nothing on the board changes until you confirm.`;

export const COMPARISONS: Comparison[] = [
  {
    slug: "plane",
    name: "Plane",
    angle: "an alternative that remembers what was tried",
    summary: "Both are self-hostable boards with an MCP server. Guidon adds known dead ends, verified-vs-AI knowledge and an AGENTS.md export.",
    url: "https://plane.so",
    shortAnswer:
      "Plane is a broad, open-source project tool - cycles, modules, many views and a large community. Guidon is narrower on purpose: a task board that keeps the reasoning and the failed attempts next to each task, and keeps what people verified apart from what AI guessed.",
    chooseGuidon: [
      "You work with AI agents and want them to see what already failed before they start",
      "You want human-verified facts kept apart from AI-written notes",
      "You want your project context in your repository as AGENTS.md",
      "You self-host and want every feature without plan limits",
    ],
    chooseThem: [
      "You want an open-source licence (AGPL-3.0) today",
      "You need cycles, modules and many views out of the box",
      "You want the larger community and ecosystem",
    ],
    overrides: {
      selfHosted: { them: "Self-hostable Community Edition; some features are in paid editions.", better: null },
      source: { them: "Better: open source (AGPL-3.0).", better: "them" },
      mcp: { them: "MCP server and its own agents.", better: null },
    },
    rows: [{ topic: "Planning", guidon: "Board, roadmap phases, calendar, recurring tasks.", them: "Better: cycles, modules, more views.", better: "them" }],
    switching: IMPORT("Plane"),
    faq: [
      { q: "Can I move from Plane to Guidon?", a: "Yes - Plane's CSV export imports directly, including state, priority, labels, assignees and target dates." },
      { q: "Is Guidon open source like Plane?", a: "Guidon's code is public on GitHub, but its application licence isn't settled yet; Plane is AGPL-3.0 today." },
    ],
  },
  {
    slug: "linear",
    name: "Linear",
    angle: "an alternative for teams that work with their own AI agents",
    summary: "Linear is the fast, polished issue tracker. Guidon keeps dead ends and verified knowledge with each task, and lets you self-host.",
    url: "https://linear.app",
    shortAnswer:
      "Linear is the benchmark for speed and polish, and it now runs its own coding agent. Guidon is for teams that bring their own agents and want the project's memory - what was tried, what was decided, what a person verified - attached to every task, on a server they can own.",
    chooseGuidon: [
      "You use your own agents (Claude Code, Cursor, Codex) and pay no AI credits",
      "You want failed attempts and verified facts to be part of each task",
      "You want to self-host, or to keep your context in your repository",
    ],
    chooseThem: [
      "You want the most polished, fastest issue tracker",
      "You want a built-in agent that writes code for you",
      "You need cycles, triage and initiatives for a growing product team",
    ],
    overrides: { mcp: { them: "Official MCP server and a built-in agent; coding sessions use AI credits.", better: null } },
    rows: [{ topic: "Speed and polish", guidon: "Fast enough for daily work.", them: "Better: famously fast, keyboard-first.", better: "them" }],
    switching: IMPORT("Linear"),
    faq: [
      { q: "Does Guidon have Linear's speed?", a: "Linear sets the bar; Guidon aims to stay out of the way, but polish isn't where it competes." },
      { q: "Can my Linear issues come over?", a: "Yes - Linear's CSV export imports, with statuses and priorities matched to your board." },
    ],
  },
  {
    slug: "jira",
    name: "Jira",
    angle: "a lighter alternative for small teams",
    summary: "Jira covers every enterprise workflow. Guidon is a lighter board that keeps the why, the dead ends and verified knowledge with each task.",
    url: "https://www.atlassian.com/software/jira",
    shortAnswer:
      "Jira can model almost any process and fits large organisations. Guidon is for small teams who find Jira heavy: a simple board where each task carries its decisions, its failed attempts and the knowledge a person checked.",
    chooseGuidon: [
      "You're a small team and want a board you don't have to administer",
      "You want AI agents without per-user AI credits",
      "You want dead ends and verified facts kept with the work",
    ],
    chooseThem: [
      "You need complex workflows, permissions and reporting at enterprise scale",
      "Your company already runs on Atlassian",
      "You need its marketplace of integrations",
    ],
    overrides: {
      selfHosted: { them: "Data Center edition for large organisations.", better: null },
      mcp: { them: "Rovo AI and an MCP server on paid plans, billed in credits.", better: null },
    },
    rows: [{ topic: "Enterprise workflows", guidon: "Configurable columns, priorities and roles.", them: "Better: almost any workflow, scheme and report.", better: "them" }],
    switching: IMPORT("Jira"),
    faq: [{ q: "Can I import from Jira?", a: "Yes - Jira's CSV export (Summary, Status, Priority, Labels, Due date) imports directly." }],
  },
  {
    slug: "notion",
    name: "Notion",
    angle: "a task board with memory you can trust",
    summary: "Notion is a flexible workspace for docs. Guidon is a task board where each task carries its attempts, decisions and verified facts.",
    url: "https://www.notion.com",
    shortAnswer:
      "Notion is a blank canvas for docs, wikis and databases, and now positions itself as context for agents. Guidon is opinionated: a board where each task's context is structured - attempts, decisions, facts a person verified - so neither people nor agents have to dig through pages.",
    chooseGuidon: [
      "You want tasks, not pages - with the reasoning attached",
      "You need to tell verified facts from AI-written notes",
      "You want to self-host, or to export context as AGENTS.md",
    ],
    chooseThem: [
      "Docs and wikis matter more to you than a task board",
      "You want to build your own databases and layouts",
      "Your company already lives in Notion",
    ],
    overrides: { mcp: { them: "MCP server and custom agents, billed in Notion credits.", better: null } },
    rows: [{ topic: "Docs and wikis", guidon: "Knowledge sources, decisions and files per project.", them: "Better: a full document and wiki editor.", better: "them" }],
    switching: IMPORT("Notion"),
    faq: [{ q: "Can I bring a Notion task database?", a: "Yes - export the database to CSV and import it; Name, Status and dates are matched." }],
  },
  {
    slug: "asana",
    name: "Asana",
    angle: "an alternative for teams that build with AI agents",
    summary: "Asana runs work across whole companies. Guidon is a focused board where AI agents and people share what was tried and what is verified.",
    url: "https://asana.com",
    shortAnswer:
      "Asana is built for coordinating work across departments, with portfolios and goals. Guidon is for teams that build things - often with AI agents - and want each task to remember its attempts and decisions.",
    chooseGuidon: ["You build software or games with AI agents", "You want dead ends and verified facts with each task", "You want to self-host"],
    chooseThem: ["You coordinate many departments and portfolios", "You need goals, workload and reporting across a company", "Non-technical teams are your main users"],
    overrides: { mcp: { them: "AI features and an MCP server.", better: null } },
    rows: [{ topic: "Company-wide planning", guidon: "Per-project boards and roadmaps.", them: "Better: portfolios, goals and workload across teams.", better: "them" }],
    switching: IMPORT("Asana"),
    faq: [{ q: "Does the Asana CSV export work?", a: "Yes - Asana's CSV (Name, Section/Column, Assignee, Due Date, Tags) imports directly." }],
  },
  {
    slug: "clickup",
    name: "ClickUp",
    angle: "a focused alternative to the all-in-one",
    summary: "ClickUp does everything in one app. Guidon does one thing deeply: tasks that keep their reasoning, dead ends and verified knowledge.",
    url: "https://clickup.com",
    shortAnswer:
      "ClickUp tries to replace every tool you have. Guidon deliberately doesn't: it's a board whose tasks keep what was tried and what a person verified, for teams that found all-in-one tools too much.",
    chooseGuidon: ["You want a simpler board, not a suite", "You work with AI agents and want them to see dead ends", "You want to self-host"],
    chooseThem: ["You want docs, goals, chat and tasks in one app", "You need many views and automations", "You're consolidating many tools into one"],
    overrides: { mcp: { them: "Built-in AI and an MCP server.", better: null } },
    rows: [{ topic: "Breadth of features", guidon: "Focused on the board and its context.", them: "Better: docs, goals, chat, whiteboards and more.", better: "them" }],
    switching: IMPORT("ClickUp"),
    faq: [{ q: "Can I import ClickUp tasks?", a: "Yes - ClickUp's CSV export (Task Name, Status, Priority, Due Date) is matched on import." }],
  },
  {
    slug: "trello",
    name: "Trello",
    angle: "a simple board that keeps the why",
    summary: "Trello is the simplest Kanban board. Guidon stays simple but adds the reasoning, dead ends and AI agents to every card.",
    url: "https://trello.com",
    shortAnswer:
      "Trello made Kanban simple. Guidon keeps that simplicity and adds what a growing project needs: decisions and attempts on each task, verified knowledge, and AI agents that can read and update the board.",
    chooseGuidon: ["Your Trello cards keep losing their context", "You want AI agents to work on your board", "You want to self-host"],
    chooseThem: ["You only need the simplest possible board", "You rely on Power-Ups", "Your team already knows Trello"],
    overrides: { mcp: { them: "No official MCP server for Trello (community ones exist).", better: "guidon" } },
    rows: [{ topic: "Simplicity", guidon: "A board first, with more one click away.", them: "Better: nothing simpler to learn.", better: "them" }],
    switching: "Export your Trello board as JSON (Menu → Print, export and share → Export as JSON) and use **Import** on a Guidon board: cards, lists, labels and due dates come over, with a preview first.",
    faq: [{ q: "Does Guidon import Trello's JSON export?", a: "Yes - the board export's cards, lists and labels are read directly, archived cards skipped." }],
  },
  {
    slug: "monday",
    name: "monday.com",
    angle: "an alternative for building with AI agents",
    summary: "monday.com is a work OS for every department. Guidon is a board for teams that build, where tasks remember their attempts and verified facts.",
    url: "https://monday.com",
    shortAnswer:
      "monday.com is a customisable work platform for every kind of team. Guidon is for teams that build software or games, often with AI agents, and want each task to carry its attempts and decisions.",
    chooseGuidon: ["You build software or games, often with AI agents", "You want dead ends and verified facts with the work", "You want to self-host"],
    chooseThem: ["Marketing, sales and operations teams are your main users", "You want dashboards and automations across departments", "You need its integrations marketplace"],
    overrides: { mcp: { them: "AI features and an MCP server.", better: null } },
    rows: [{ topic: "Non-technical teams", guidon: "Templates for marketing and support, but built for teams that build.", them: "Better: boards for any department.", better: "them" }],
    switching: "Export your monday.com board to Excel, save it as CSV, and use **Import** on a Guidon board - names, statuses, people and dates are matched, with a preview first.",
    faq: [{ q: "Can I move a monday.com board?", a: "Yes, via its Excel export saved as CSV." }],
  },
  {
    slug: "github-projects",
    name: "GitHub Projects",
    angle: "context for the work around your code",
    summary: "GitHub Projects tracks issues next to your code. Guidon adds decisions, dead ends and verified knowledge - and links commits and PRs back.",
    url: "https://github.com/features/issues",
    shortAnswer:
      "GitHub Projects is right next to your code and issues. Guidon works alongside it: commits and pull requests that mention a task are linked to it, and each task also keeps its decisions, attempts and verified facts - context GitHub issues don't structure.",
    chooseGuidon: ["You want decisions and dead ends structured, not buried in issue threads", "Your agents need a curated project brief", "Non-developers plan with you"],
    chooseThem: ["Everything you track is code issues", "You want zero extra tools", "You rely on GitHub Actions automations on issues"],
    overrides: {
      selfHosted: { them: "With GitHub Enterprise Server.", better: null },
      mcp: { them: "GitHub's official MCP server.", better: null },
    },
    rows: [{ topic: "Next to the code", guidon: "Links commits and PRs that mention a task, and can move it.", them: "Better: lives in the repository itself.", better: "them" }],
    switching: IMPORT("GitHub"),
    faq: [{ q: "Do I have to leave GitHub?", a: "No - keep your code there; Guidon links commits and PRs that mention a task (guidon#ref) and moves it along." }],
  },
  {
    slug: "codecks",
    name: "Codecks",
    angle: "for game developers working with AI agents",
    summary: "Codecks is built for game studios. Guidon adds dead ends, verified knowledge and a Godot plugin that opens the scene an attempt touched.",
    url: "https://www.codecks.io",
    shortAnswer:
      "Codecks is made for game development, with decks, Discord integration and public roadmaps. Guidon is for game developers who build with AI agents: tasks remember what was tried (physics, shaders, builds), and the Godot plugin shows those dead ends in the editor.",
    chooseGuidon: ["You use Claude Code or Cursor on your game", "You want failed attempts linked to the scenes they touched", "You want to self-host"],
    chooseThem: ["You want its card-and-deck style", "You run a public roadmap with community voting", "Your community lives on Discord and you want that integration"],
    overrides: { mcp: { them: "Official MCP server announced in October 2026.", better: null } },
    rows: [
      { topic: "Game engines", guidon: "Better: plugins for Godot, Unity, Unreal and Blender; Godot shows dead ends and opens their scenes.", them: "Not engine plugins.", better: "guidon" },
      { topic: "Community features", guidon: "In-game bug reports from players.", them: "Better: public roadmaps and Discord integration.", better: "them" },
    ],
    switching: IMPORT("Codecks"),
    faq: [{ q: "Is Guidon only for games?", a: "No, but game development is where its dead-end tracking helps most - physics, shaders and builds are full of trial and error." }],
  },
  {
    slug: "hacknplan",
    name: "HacknPlan",
    angle: "for game developers working with AI agents",
    summary: "HacknPlan pairs tasks with a game design model. Guidon adds dead ends, verified knowledge, AI agents and engine plugins.",
    url: "https://hacknplan.com",
    shortAnswer:
      "HacknPlan links tasks to a living game design document. Guidon is for developers who build with AI agents: an official MCP server, dead ends with each task, and engine plugins that bring them into the editor.",
    chooseGuidon: ["You want AI agents with an official MCP server", "You want dead ends linked to scenes in Godot", "You want to self-host"],
    chooseThem: ["You plan around a game design model (GDD)", "Your team already uses it for production"],
    overrides: { mcp: { them: "No official MCP server (community ones exist).", better: "guidon" } },
    rows: [{ topic: "Game design document", guidon: "Decisions and knowledge per project.", them: "Better: a game design model linked to tasks.", better: "them" }],
    switching: IMPORT("HacknPlan"),
    faq: [{ q: "Can I keep my game design document?", a: "Keep it where it is and link it as a knowledge source; Guidon's decisions and verified facts sit next to the tasks." }],
  },
];

export function comparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}

/** The page as Markdown (MarkdownPage renders it, the .md twin serves it). */
export function comparisonMarkdown(c: Comparison): string {
  const rows = comparisonRows(c);
  const cell = (text: string) => text.replace(/\|/g, "\\|");
  const wins = rows.filter((row) => row.better === "guidon").length;
  const others = COMPARISONS.filter((other) => other.slug !== c.slug);
  return [
    `[All comparisons](/compare)`,
    "",
    `# Guidon vs ${c.name}: ${c.angle}`,
    "",
    c.summary,
    "",
    `_Checked ${CHECKED}. Features change - see [${c.name}'s site](${c.url}) for theirs._`,
    "",
    "## The short answer",
    "",
    c.shortAnswer,
    "",
    "### Choose Guidon if",
    "",
    ...c.chooseGuidon.map((line) => `- ${line}`),
    "",
    `### Choose ${c.name} if`,
    "",
    ...c.chooseThem.map((line) => `- ${line}`),
    "",
    "## At a glance",
    "",
    `Guidon is better on ${wins} of ${rows.length} topics below; ${c.name} is better where it says so.`,
    "",
    `| Topic | Guidon | ${c.name} |`,
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${cell(row.topic)} | ${cell(row.guidon)} | ${cell(row.them)} |`),
    "",
    `## Switching from ${c.name}`,
    "",
    c.switching,
    "",
    "## Questions",
    "",
    ...c.faq.flatMap((item) => [`**${item.q}**`, "", item.a, ""]),
    "## More comparisons",
    "",
    ...others.map((other) => `- [Guidon vs ${other.name}](/compare/${other.slug})`),
    "",
    "---",
    "",
    "**Try Guidon free** - [start a project](/start) or [explore the sandbox](/sandbox). Self-hosted with every feature: [self-hosting guide](https://github.com/two-steps-studio/guidon/blob/main/docs/self-hosting.md).",
    "",
  ].join("\n");
}

export function compareIndexMarkdown(): string {
  return [
    "# Compare Guidon",
    "",
    "How Guidon compares with the project tools teams use most. Each page says who should choose which - including where the other tool is better.",
    "",
    ...COMPARISONS.flatMap((c) => [`## [Guidon vs ${c.name}](/compare/${c.slug})`, "", c.summary, ""]),
  ].join("\n");
}
