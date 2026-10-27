/**
 * Smart Linking (migration 097), pure and import-free like task-refs.ts so
 * tests/github-webhook.test.mjs runs it with plain node. The webhook turns a
 * GitHub event into:
 *
 * - explicit links: a commit, branch or PR that mentions `guidon#xxxxxxxx`
 *   (the same references task-refs.ts already acts on) - confirmed facts;
 * - suggestions: a PR that mentions no task but shares distinctive words
 *   with an open task's title - a proposal with confidence < 1 that a
 *   person confirms or rejects. Generic words never count, two shared
 *   words are the minimum, and at most three tasks are suggested.
 */

export type LinkKind = "commit" | "pull_request" | "branch";
export type PrState = "open" | "draft" | "merged" | "closed";

export interface LinkSpec {
  /** Task reference (8-char prefix or full id), lowercase. */
  ref: string;
  kind: LinkKind;
  externalRef: string;
  title: string | null;
  url: string | null;
  prState: PrState | null;
  evidence: string;
}

const REF_PATTERN = /guidon[#-]([0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)(?![0-9a-z])/gi;

function refsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(REF_PATTERN)].map((match) => match[1].toLowerCase()))];
}

function firstLine(text: string | null | undefined, max = 200): string {
  const line = (text ?? "").split("\n")[0].replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function githubUrl(url: unknown): string | null {
  return typeof url === "string" && /^https:\/\/github\.com\/[^\s]{1,400}$/.test(url) ? url : null;
}

/** `owner/name` when both parts are valid GitHub names, else null. */
export function repositoryName(owner: string, name: string): string | null {
  const valid = (part: string) => /^[A-Za-z0-9_.-]{1,100}$/.test(part);
  return valid(owner) && valid(name) ? `${owner}/${name}` : null;
}

interface PushPayload { ref?: string; commits?: Array<{ id?: string; message?: string; url?: string }> }
interface PullRequestPayload {
  action?: string;
  number?: number;
  pull_request?: { title?: string; body?: string | null; html_url?: string; draft?: boolean; merged?: boolean; state?: string; head?: { ref?: string } };
}

export function prStateOf(payload: PullRequestPayload): PrState | null {
  const pr = payload.pull_request;
  if (!pr) return null;
  if (pr.merged) return "merged";
  if (payload.action === "closed" || pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
}

export function planPushLinks(payload: PushPayload, repository: string): LinkSpec[] {
  const branch = (payload.ref ?? "").replace(/^refs\/heads\//, "");
  const branchRefs = refsIn(branch);
  const links: LinkSpec[] = [];
  for (const ref of branchRefs) {
    links.push({ ref, kind: "branch", externalRef: branch.slice(0, 200), title: branch.slice(0, 300), url: `https://github.com/${repository}/tree/${encodeURIComponent(branch)}`, prState: null, evidence: `Branch name mentions guidon#${ref.slice(0, 8)}` });
  }
  for (const commit of payload.commits ?? []) {
    const sha = typeof commit.id === "string" && /^[0-9a-f]{7,40}$/i.test(commit.id) ? commit.id.toLowerCase() : null;
    if (!sha) continue;
    const messageRefs = refsIn(commit.message);
    for (const ref of new Set([...messageRefs, ...branchRefs])) {
      links.push({
        ref, kind: "commit", externalRef: sha, title: firstLine(commit.message) || null, url: githubUrl(commit.url), prState: null,
        evidence: messageRefs.includes(ref) ? `Commit message mentions guidon#${ref.slice(0, 8)}` : `Commit on branch ${branch.slice(0, 100)}, which mentions guidon#${ref.slice(0, 8)}`,
      });
    }
  }
  return links;
}

export function planPullRequestLinks(payload: PullRequestPayload): LinkSpec[] {
  const pr = payload.pull_request;
  if (!pr || typeof payload.number !== "number") return [];
  const where = (ref: string) => [refsIn(pr.title).includes(ref) && "title", refsIn(pr.body).includes(ref) && "description", refsIn(pr.head?.ref).includes(ref) && "branch"].filter(Boolean).join(", ");
  return [...new Set([...refsIn(pr.title), ...refsIn(pr.body), ...refsIn(pr.head?.ref)])].map((ref) => ({
    ref, kind: "pull_request" as const, externalRef: String(payload.number), title: firstLine(pr.title) || null, url: githubUrl(pr.html_url), prState: prStateOf(payload),
    evidence: `PR ${where(ref)} mentions guidon#${ref.slice(0, 8)}`,
  }));
}

// Words that say nothing about which task a change belongs to.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "when", "then", "than", "add", "adds", "added", "fix", "fixes", "fixed",
  "update", "updates", "updated", "change", "changes", "changed", "remove", "removed", "make", "makes", "use", "using", "new", "old",
  "more", "less", "some", "all", "not", "bug", "bugs", "issue", "task", "tasks", "feature", "chore", "refactor", "cleanup", "test",
  "tests", "docs", "doc", "wip", "minor", "small", "main", "master", "dev", "branch", "merge", "pull", "request", "draft", "release",
  "version", "bump", "code", "file", "files", "page", "pages", "dodaj", "popraw", "poprawka", "zmiana", "zmiany", "nowy", "nowa",
]);

export function distinctiveWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/guidon[#-][0-9a-f-]+/g, " ").split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word) && !/^\d+$/.test(word)),
  );
}

export interface Suggestion { taskId: string; confidence: number; evidence: string }

/**
 * Open tasks whose title shares at least two distinctive words with the PR,
 * covering at least half of the task's own distinctive words. Confidence is
 * 0.40-0.90 (never certain); best three.
 */
export function suggestLinks(text: string, tasks: Array<{ id: string; title: string }>, max = 3): Suggestion[] {
  const words = distinctiveWords(text);
  if (words.size < 2) return [];
  const scored: Suggestion[] = [];
  for (const task of tasks) {
    const taskWords = distinctiveWords(task.title);
    if (taskWords.size < 2) continue;
    const shared = [...taskWords].filter((word) => words.has(word));
    const coverage = shared.length / taskWords.size;
    if (shared.length < 2 || coverage < 0.5) continue;
    const confidence = Math.min(0.9, Math.round((0.4 + 0.5 * coverage) * 100) / 100);
    scored.push({ taskId: task.id, confidence, evidence: `Shares ${shared.length} of ${taskWords.size} distinctive title words: ${shared.slice(0, 6).join(", ")}` });
  }
  return scored.sort((left, right) => right.confidence - left.confidence || left.taskId.localeCompare(right.taskId)).slice(0, max);
}

/** The PR itself as a link target (for suggestions), or null when the payload has no PR number. */
export function pullRequestTarget(payload: PullRequestPayload): Omit<LinkSpec, "ref" | "evidence"> | null {
  const pr = payload.pull_request;
  if (!pr || typeof payload.number !== "number") return null;
  return { kind: "pull_request", externalRef: String(payload.number), title: firstLine(pr.title) || null, url: githubUrl(pr.html_url), prState: prStateOf(payload) };
}

/** Text a new or reopened PR is matched against open tasks with, or null when the event shouldn't suggest. */
export function suggestionText(payload: PullRequestPayload): string | null {
  if (!["opened", "reopened", "ready_for_review"].includes(payload.action ?? "")) return null;
  const pr = payload.pull_request;
  return pr ? [pr.title ?? "", (pr.body ?? "").slice(0, 1000), pr.head?.ref ?? ""].join(" ") : null;
}
