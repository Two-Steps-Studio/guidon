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
    // Next.js's server-side fetch defaults to caching GET requests. GitHub
    // API responses (repo lists, org membership, file contents/shas) must
    // always reflect the live state, so opt every call out of that cache.
    cache: "no-store",
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

export interface RefreshedGithubToken {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Exchanges a still-valid refresh token for a new user-to-server access
 * token. GitHub Apps' user tokens expire (~8h) and rotate their refresh
 * token (~6mo) on every use - the caller MUST persist the returned
 * `refreshToken`, never reuse the one passed in, since GitHub invalidates
 * it immediately once used.
 */
export async function refreshUserToken(refreshToken: string): Promise<RefreshedGithubToken> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GithubApiError(500, "GitHub integration is not configured on this server.");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !data?.access_token || !data.refresh_token) {
    throw new GithubApiError(
      401,
      data?.error_description ?? data?.error ?? "GitHub connection expired - reconnect the repository."
    );
  }

  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(now + (data.expires_in ?? 0) * 1000),
    refreshTokenExpiresAt: new Date(now + (data.refresh_token_expires_in ?? 0) * 1000),
  };
}

export interface GithubRepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export interface GithubInstallationSummary {
  id: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  avatarUrl: string;
}

/**
 * GitHub App installations the connecting user can access, for the
 * account/org picker. Unlike the old OAuth App's `/user/orgs`, this needs
 * no per-org "Grant" step - an installation only appears here because an
 * org owner already installed the app on it.
 */
export async function listUserInstallations(token: string): Promise<GithubInstallationSummary[]> {
  const data = await githubFetch<{
    installations: Array<{
      id: number;
      account: { login: string; type: string; avatar_url: string };
    }>;
  }>(token, "/user/installations?per_page=100");

  return data.installations.map((installation) => ({
    id: installation.id,
    accountLogin: installation.account.login,
    accountType: installation.account.type === "Organization" ? "Organization" : "User",
    avatarUrl: installation.account.avatar_url,
  }));
}

/**
 * Repos accessible to the connecting user under one installation, most-
 * recently-pushed first. This endpoint has no text-search param (unlike
 * `/search/repositories`), so `search` filters the fetched page client-side.
 */
export async function listInstallationRepos(
  token: string,
  installationId: number,
  { search, page = 1 }: { search?: string; page?: number } = {}
): Promise<GithubRepoSummary[]> {
  const data = await githubFetch<{
    repositories: Array<{
      name: string;
      full_name: string;
      private: boolean;
      default_branch: string;
      owner: { login: string };
    }>;
  }>(token, `/user/installations/${installationId}/repositories?per_page=100&page=${page}`);

  const repos = data.repositories.map(toRepoSummary);
  if (!search?.trim()) return repos;

  const needle = search.trim().toLowerCase();
  return repos.filter((repo) => repo.name.toLowerCase().includes(needle));
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
  ref: string,
  options: { raw?: boolean } = {}
): Promise<GithubFileContent> {
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const data = await githubFetch<{ content: string; sha: string; encoding: string; type: string; size: number }>(
    token,
    `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
  );

  if (data.type !== "file") {
    throw new GithubApiError(400, "That path is a directory, not a file.");
  }

  // The Contents API only inlines `content` for files up to 1MB - above
  // that it comes back with an empty string and no error, which used to
  // render as a silently blank file. The Git Blobs API has no such limit
  // (up to 100MB) and returns the same base64 shape, keyed by the blob sha
  // this same response already gave us.
  const rawContent =
    data.content === "" && data.size > 0 ? await getBlob(token, owner, repo, data.sha) : data.content;

  // Images must stay base64 (fed straight into a data: URL) - decoding as
  // utf8 would corrupt binary bytes. Text files still get decoded as before.
  const content =
    !options.raw && data.encoding === "base64"
      ? Buffer.from(rawContent, "base64").toString("utf8")
      : rawContent;

  return { content, sha: data.sha, encoding: data.encoding };
}

/** Git Blobs API - the >1MB fallback getFile() uses above. `content` may
 * contain embedded newlines (GitHub wraps its base64 output); callers that
 * feed this into Buffer.from(..., "base64") or a data: URL both tolerate
 * that, but strip them to be safe for anything stricter. */
async function getBlob(token: string, owner: string, repo: string, sha: string): Promise<string> {
  const data = await githubFetch<{ content: string; encoding: string }>(
    token,
    `/repos/${owner}/${repo}/git/blobs/${sha}`
  );
  return data.content.replace(/\n/g, "");
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

// Bounds how many pages listBranches() will follow - 10 pages x 100 per
// page covers any repo with a remotely reasonable branch count; a repo
// beyond that is pathological enough that showing the first 1000 is a
// better failure mode than an unbounded loop against GitHub's API.
const MAX_BRANCH_PAGES = 10;

/**
 * A single page only returns the first 100 branches (GitHub's max
 * per_page) - for a repo with more than that, `commitRepoFile`'s PR-mode
 * path looks up the base branch by name in this list, and a branch outside
 * the first page used to come back as a false "not found" even though it
 * exists. Pages until a short page signals the end, rather than parsing
 * the Link header.
 */
export async function listBranches(
  token: string,
  owner: string,
  repo: string
): Promise<GithubBranch[]> {
  const branches: GithubBranch[] = [];

  for (let page = 1; page <= MAX_BRANCH_PAGES; page++) {
    const data = await githubFetch<Array<{ name: string; commit: { sha: string } }>>(
      token,
      `/repos/${owner}/${repo}/branches?per_page=100&page=${page}`
    );
    branches.push(...data.map((b) => ({ name: b.name, commitSha: b.commit.sha })));
    if (data.length < 100) break;
  }

  return branches;
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

/**
 * Deletes `branch` outright - used only to clean up a branch this app just
 * created moments ago when a later step in the same "commit to a new
 * branch" flow (commitRepoFile) fails before anything of value landed on
 * it, so a retry doesn't immediately hit "Reference already exists".
 */
export async function deleteBranch(token: string, owner: string, repo: string, branch: string): Promise<void> {
  await githubFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "DELETE",
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
