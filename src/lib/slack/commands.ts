/**
 * The `/guidon` Slack command's text handling - parsing what was typed,
 * resolving a task reference, formatting replies. Pure functions with no
 * imports from the app (tests/slack.test.mjs runs them with plain Node);
 * the route (src/app/api/integrations/slack/commands/route.ts) does the I/O.
 */

export const SLACK_STATUSES = ["backlog", "todo", "in_progress", "ai_working", "review", "done"] as const;
export type SlackTaskStatus = (typeof SLACK_STATUSES)[number];

/** `list` without a status: what a team is working on, not the whole backlog. */
export const DEFAULT_LIST_STATUSES: readonly SlackTaskStatus[] = ["todo", "in_progress", "ai_working", "review"];
export const LIST_LIMIT = 20;
export const COMMENT_MAX_LENGTH = 4000;

export type SlackCommand =
  | { kind: "help" }
  | { kind: "link" }
  | { kind: "list"; statuses: readonly SlackTaskStatus[] | "all" }
  | { kind: "start" | "done"; ref: string }
  | { kind: "comment"; ref: string; text: string }
  | { kind: "usage"; message: string }
  | { kind: "unknown"; word: string };

const STATUS_ALIASES: Record<string, SlackTaskStatus> = {
  backlog: "backlog",
  todo: "todo",
  "to-do": "todo",
  progress: "in_progress",
  "in-progress": "in_progress",
  in_progress: "in_progress",
  doing: "in_progress",
  ai: "ai_working",
  ai_working: "ai_working",
  review: "review",
  done: "done",
};

/**
 * Slack sends a slash command's text with `&`, `<` and `>` escaped as HTML
 * entities (mentions and links come through as `<@U123|name>`-style markup).
 * A comment should read like what was typed.
 */
export function unescapeSlackText(text: string): string {
  return text
    .replace(/<([@#!][^|>]*)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseSlackCommand(text: string): SlackCommand {
  const trimmed = (text ?? "").trim();
  const [rawWord = "", ...rest] = trimmed.split(/\s+/);
  const word = rawWord.toLowerCase();
  // Everything after the first two words, spacing kept (a comment's text).
  const afterRef = trimmed.replace(/^\S+\s+\S+\s*/, "");

  switch (word) {
    case "":
    case "help":
      return { kind: "help" };
    case "link":
    case "connect":
      return { kind: "link" };
    case "list":
    case "tasks": {
      const filter = rest[0]?.toLowerCase();
      if (!filter) return { kind: "list", statuses: DEFAULT_LIST_STATUSES };
      if (filter === "all") return { kind: "list", statuses: "all" };
      const status = STATUS_ALIASES[filter];
      if (!status) {
        return { kind: "usage", message: `Unknown status "${rest[0]}". Use one of: ${SLACK_STATUSES.join(", ")}, all.` };
      }
      return { kind: "list", statuses: [status] };
    }
    case "start":
    case "done":
    case "complete": {
      const kind = word === "start" ? "start" : "done";
      if (!rest[0]) return { kind: "usage", message: `Usage: /guidon ${word} <task>` };
      return { kind, ref: rest[0] };
    }
    case "comment": {
      if (!rest[0] || !afterRef) return { kind: "usage", message: "Usage: /guidon comment <task> <text>" };
      if (afterRef.length > COMMENT_MAX_LENGTH) {
        return { kind: "usage", message: `A comment can be at most ${COMMENT_MAX_LENGTH} characters.` };
      }
      return { kind: "comment", ref: rest[0], text: unescapeSlackText(afterRef) };
    }
    default:
      return { kind: "unknown", word: rawWord };
  }
}

export interface SlackTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
}

/** `guidon#1a2b3c4d` - the same reference the GitHub integration and the plugins use. */
export function gitRef(taskId: string): string {
  return `guidon#${taskId.slice(0, 8).toLowerCase()}`;
}

/**
 * A task by full id, its 8-character prefix, or `guidon#<prefix>` (what the
 * list prints). At least 6 hex characters, so a typo can't match half the
 * board; more than one match is reported rather than guessed.
 */
export function resolveTaskRef<T extends { id: string }>(
  ref: string,
  tasks: readonly T[]
): { task: T } | { error: "invalid" | "not_found" | "ambiguous" } {
  const cleaned = ref.trim().toLowerCase().replace(/^guidon#/, "").replace(/^#/, "");
  if (!/^[0-9a-f-]{6,36}$/.test(cleaned)) return { error: "invalid" };
  const matches = tasks.filter((task) => task.id.toLowerCase().startsWith(cleaned));
  if (matches.length === 0) return { error: "not_found" };
  if (matches.length > 1) return { error: "ambiguous" };
  return { task: matches[0] };
}

/** Slack mrkdwn needs only these three escaped (https://api.slack.com/reference/surfaces/formatting#escaping). */
export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatTaskList(
  tasks: readonly SlackTask[],
  labelFor: (status: string) => string,
  taskUrl: (taskId: string) => string
): string {
  if (tasks.length === 0) return "No tasks here.";
  const lines = tasks
    .slice(0, LIST_LIMIT)
    .map(
      (task) =>
        `\`${gitRef(task.id)}\` <${taskUrl(task.id)}|${escapeMrkdwn(task.title || "(untitled)")}> - ${escapeMrkdwn(labelFor(task.status))}${
          task.priority ? ` (${task.priority})` : ""
        }`
    );
  const more = tasks.length > LIST_LIMIT ? `\n...and ${tasks.length - LIST_LIMIT} more.` : "";
  return lines.join("\n") + more;
}

export const HELP_TEXT = [
  "*Guidon in Slack*",
  "`/guidon list [status|all]` - tasks of this channel's project (default: todo, in progress, review)",
  "`/guidon start <task>` - move a task to In Progress",
  "`/guidon done <task>` - move a task to Done",
  "`/guidon comment <task> <text>` - comment on a task",
  "`/guidon link` - connect this channel to a Guidon project",
  "`<task>` is the reference from the list, e.g. `guidon#1a2b3c4d`.",
].join("\n");
