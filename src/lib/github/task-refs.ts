/**
 * What a GitHub event means for Guidon tasks - pure and import-free so it can
 * be tested with plain `node` (tests/github-webhook.test.mjs). The webhook
 * route (src/app/api/github/webhook/route.ts) verifies the signature, finds
 * the connected projects and applies these actions under RLS.
 *
 * A task is referenced as `guidon#<first 8 hex chars of its id>` (what the
 * web app's task dialog and every editor plugin copy), or with the full id,
 * in a commit message, a PR title/body or a branch name. `guidon-1a2b3c4d`
 * works too, because `#` isn't allowed in some branch-naming schemes.
 */

export type TaskStatus = "backlog" | "todo" | "in_progress" | "ai_working" | "review" | "done";

export interface TaskAction {
  /** 8-char id prefix or a full uuid, lowercase. */
  ref: string;
  /** Idempotency key: the same GitHub event never acts twice on a task (webhooks are redelivered). */
  eventKey: string;
  comment: string;
  /** Move the task here, if it's currently in one of `fromStatuses` (null = only comment). */
  targetStatus: TaskStatus | null;
  fromStatuses: TaskStatus[];
}

const REF_PATTERN = /guidon[#-]([0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)(?![0-9a-z])/gi;

const NOT_DONE: TaskStatus[] = ["backlog", "todo", "in_progress", "ai_working", "review"];
const NOT_STARTED: TaskStatus[] = ["backlog", "todo"];

/** Every task reference in the given texts, deduplicated, lowercase. */
export function extractTaskRefs(...texts: Array<string | null | undefined>): string[] {
  const refs = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(REF_PATTERN)) refs.add(match[1].toLowerCase());
  }
  return [...refs];
}

/** The copyable reference for a task id. */
export function taskRef(taskId: string): string {
  return `guidon#${taskId.slice(0, 8).toLowerCase()}`;
}

function firstLine(text: string, max = 120): string {
  const line = (text ?? "").split("\n")[0].trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

/** Comments are plain text everywhere they're shown (web dialog, plugins) - one line, no control characters. */
function inline(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    out += code < 32 || code === 127 ? " " : char;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Only real GitHub links are appended - a payload can't smuggle another URL into the task. */
function withUrl(text: string, url: unknown): string {
  return typeof url === "string" && /^https:\/\/github\.com\/[^\s]*$/.test(url) ? `${text} - ${url}` : text;
}

// Minimal shapes of the GitHub payload fields used here.
interface PushPayload {
  ref?: string;
  commits?: Array<{ id?: string; message?: string; url?: string; author?: { name?: string; username?: string } }>;
}

interface PullRequestPayload {
  action?: string;
  number?: number;
  pull_request?: {
    title?: string;
    body?: string | null;
    html_url?: string;
    draft?: boolean;
    merged?: boolean;
    head?: { ref?: string };
    base?: { ref?: string };
    user?: { login?: string };
  };
}

/** A push: each referencing commit links itself on the task; work that hadn't started moves to In Progress. */
export function planPush(payload: PushPayload): TaskAction[] {
  const branch = (payload.ref ?? "").replace(/^refs\/heads\//, "");
  const branchRefs = extractTaskRefs(branch);
  const actions: TaskAction[] = [];
  for (const commit of payload.commits ?? []) {
    const sha = typeof commit.id === "string" ? commit.id : "";
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) continue;
    const refs = new Set([...extractTaskRefs(commit.message), ...branchRefs]);
    const author = commit.author?.username || commit.author?.name || "someone";
    for (const ref of refs) {
      actions.push({
        ref,
        eventKey: `commit:${sha.toLowerCase()}`,
        comment: withUrl(`Commit ${sha.slice(0, 7)} by ${inline(author)} on ${inline(branch)}: ${inline(firstLine(commit.message ?? ""))}`, commit.url),
        targetStatus: "in_progress",
        fromStatuses: NOT_STARTED,
      });
    }
  }
  return actions;
}

/**
 * A pull request: opened/ready for review moves referenced tasks to Review
 * (a draft only to In Progress), merged into the default branch moves them to
 * Done, closed without merging only leaves a note.
 */
export function planPullRequest(payload: PullRequestPayload, defaultBranch: string): TaskAction[] {
  const pr = payload.pull_request;
  const number = payload.number;
  if (!pr || typeof number !== "number") return [];

  const refs = extractTaskRefs(pr.title, pr.body, pr.head?.ref);
  if (refs.length === 0) return [];

  const label = `PR #${number}`;
  const title = inline(firstLine(pr.title ?? ""));
  const who = inline(pr.user?.login ?? "someone");
  let comment: string;
  let targetStatus: TaskStatus | null = null;
  let fromStatuses: TaskStatus[] = [];
  let key: string;

  switch (payload.action) {
    case "opened":
    case "reopened":
    case "ready_for_review":
      key = `pr:${number}:${payload.action === "ready_for_review" ? "ready" : "open"}`;
      if (pr.draft) {
        comment = `Draft ${label} opened by ${who}: ${title}`;
        targetStatus = "in_progress";
        fromStatuses = NOT_STARTED;
      } else {
        comment = `${label} ${payload.action === "ready_for_review" ? "is ready for review" : "opened"} by ${who}: ${title}`;
        targetStatus = "review";
        fromStatuses = ["backlog", "todo", "in_progress", "ai_working"];
      }
      break;
    case "closed":
      key = `pr:${number}:closed`;
      if (pr.merged && pr.base?.ref === defaultBranch) {
        comment = `${label} merged into ${inline(defaultBranch)}: ${title}`;
        targetStatus = "done";
        fromStatuses = NOT_DONE;
      } else if (pr.merged) {
        comment = `${label} merged into ${inline(pr.base?.ref ?? "")} (not the default branch, status unchanged): ${title}`;
      } else {
        comment = `${label} closed without merging: ${title}`;
      }
      break;
    default:
      return [];
  }

  comment = withUrl(comment, pr.html_url);
  return refs.map((ref) => ({ ref, eventKey: key, comment, targetStatus, fromStatuses }));
}
