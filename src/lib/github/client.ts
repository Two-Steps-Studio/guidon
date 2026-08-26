import "server-only";

/**
 * Thin wrapper over the GitHub REST API (api.github.com) - just the handful
 * of endpoints the in-app code editor needs (browse a repo tree, read/write
 * one file, and the branch+PR path for "commit to a new branch"). Not a
 * general-purpose GitHub SDK.
 */

const API_BASE = "https://api.github.com";

export class GithubApiError extends Error {
  status: number;
  /** True on 401 - the stored token is dead and the repo needs reconnecting. */
  needsReconnect: boolean;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
    this.needsReconnect = status === 401;
  }
}

async function githubFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      (body && typeof body === "object" && "message" in body && String(body.message)) ||
      `GitHub API request failed (${response.status})`;

    if (response.status === 401) {
      throw new GithubApiError(401, "GitHub connection expired - reconnect the repository.");
    }
    throw new GithubApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface GithubUser {
  login: string;
}

export async function getAuthenticatedUser(token: string): Promise<GithubUser> {
  return githubFetch<GithubUser>(token, "/user");
}

export interface GithubRepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

/** Repos the connecting user can access, most-recently-pushed first. */
export async function listUserRepos(
  token: string,
  { search, page = 1 }: { search?: string; page?: number } = {}
): Promise<GithubRepoSummary[]> {
  type RawRepo = {
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    owner: { login: string };
  };

  if (search?.trim()) {
    const q = encodeURIComponent(`${search.trim()} in:name fork:true`);
    const data = await githubFetch<{ items: RawRepo[] }>(
      token,
      `/search/repositories?q=${q}+user:@me&per_page=25`
    );
    return data.items.map(toRepoSummary);
  }

  const data = await githubFetch<RawRepo[]>(
    token,
    `/user/repos?per_page=50&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`
  );
  return data.map(toRepoSummary);
}

function toRepoSummary(raw: {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
}): GithubRepoSummary {
  return {
    owner: raw.owner.login,
    name: raw.name,
    fullName: raw.full_name,
    private: raw.private,
    defaultBranch: raw.default_branch,
  };
}

export async function getRepo(
  token: string,
  owner: string,
  repo: string
): Promise<GithubRepoSummary> {
  const raw = await githubFetch<{
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    owner: { login: string };
  }>(token, `/repos/${owner}/${repo}`);
  return toRepoSummary(raw);
}

export interface GithubTreeEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
  size?: number;
}

/** One directory level - lazy, so opening a repo never walks the whole tree. */
export async function listDirectory(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<GithubTreeEntry[]> {
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const data = await githubFetch<
    Array<{ name: string; path: string; type: string; sha: string; size?: number }>
  >(token, `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`);

  return data
    .filter((entry) => entry.type === "file" || entry.type === "dir")
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type as "file" | "dir",
      sha: entry.sha,
      size: entry.size,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export interface GithubFileContent {
  content: string;
  sha: string;
  encoding: string;
}

export async function getFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<GithubFileContent> {
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const data = await githubFetch<{ content: string; sha: string; encoding: string; type: string }>(
    token,
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
  );

  if (data.type !== "file") {
    throw new GithubApiError(400, "That path is a directory, not a file.");
  }

  const content =
    data.encoding === "base64"
      ? Buffer.from(data.content, "base64").toString("utf8")
      : data.content;

  return { content, sha: data.sha, encoding: data.encoding };
}

export interface PutFileResult {
  sha: string;
  commitSha: string;
  commitUrl: string;
}

/**
 * Contents API `PUT` - a direct commit of one file to `branch`. No
 * explicit committer/author is sent: GitHub attributes the commit to
 * whichever account the token belongs to, which is exactly the "commits go
 * as the connecting user" model this integration uses.
 */
export async function putFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string,
  branch: string,
  message: string
): Promise<PutFileResult> {
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const data = await githubFetch<{
    content: { sha: string };
    commit: { sha: string; html_url: string };
  }>(token, `/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      sha,
      branch,
    }),
  });

  return {
    sha: data.content.sha,
    commitSha: data.commit.sha,
    commitUrl: data.commit.html_url,
  };
}

export interface GithubBranch {
  name: string;
  commitSha: string;
}

export async function listBranches(
  token: string,
  owner: string,
  repo: string
): Promise<GithubBranch[]> {
  const data = await githubFetch<Array<{ name: string; commit: { sha: string } }>>(
    token,
    `/repos/${owner}/${repo}/branches?per_page=100`
  );
  return data.map((b) => ({ name: b.name, commitSha: b.commit.sha }));
}

/** Creates `newBranch` pointing at `fromSha` (a commit sha, e.g. a branch tip). */
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  newBranch: string,
  fromSha: string
): Promise<void> {
  await githubFetch(token, `/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
  });
}

export interface PullRequestResult {
  number: number;
  url: string;
}

export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body?: string
): Promise<PullRequestResult> {
  const data = await githubFetch<{ number: number; html_url: string }>(
    token,
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({ head, base, title, body }),
    }
  );
  return { number: data.number, url: data.html_url };
}
