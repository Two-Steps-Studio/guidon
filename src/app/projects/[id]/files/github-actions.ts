"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, canWriteProject, getProjectAccess } from "@/lib/data/project-access";
import { logActivity } from "@/lib/data/log-activity";
import {
  deleteGithubConnection,
  getProjectGithubToken,
  upsertGithubConnection,
} from "@/lib/data/github-connection";
import {
  GithubApiError,
  createBranch,
  createPullRequest,
  deleteBranch,
  getFile,
  getRepo,
  listBranches,
  listDirectory,
  listInstallationRepos,
  listUserInstallations,
  putFile,
  type GithubInstallationSummary,
  type GithubRepoSummary,
  type GithubTreeEntry,
} from "@/lib/github/client";
import { getPendingGithubConnection, clearPendingGithubConnection } from "@/lib/github/pending-connection";
import { detectFileKind } from "@/types/file";

function apiErrorMessage(error: unknown): string {
  if (error instanceof GithubApiError) {
    return error.needsReconnect ? error.message : `GitHub error: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Something went wrong talking to GitHub.";
}

// ---------------------------------------------------------------------------
// Connect / disconnect
// ---------------------------------------------------------------------------

/** Installations the connecting user can access, so the picker can offer "my account" vs. an org. */
export async function installationsForPicker(
  projectId: string
): Promise<{ installations: GithubInstallationSummary[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { installations: [], error: "You do not have permission to connect a repository." };
  }

  const pending = await getPendingGithubConnection(projectId);
  if (!pending) {
    return { installations: [], error: "Your GitHub sign-in expired. Start over." };
  }

  try {
    const installations = await listUserInstallations(pending.accessToken);
    return { installations, error: null };
  } catch (error) {
    return { installations: [], error: apiErrorMessage(error) };
  }
}

export async function reposForPicker(
  projectId: string,
  installationId: number,
  search?: string
): Promise<{ repos: GithubRepoSummary[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { repos: [], error: "You do not have permission to connect a repository." };
  }

  const pending = await getPendingGithubConnection(projectId);
  if (!pending) {
    return { repos: [], error: "Your GitHub sign-in expired. Start over." };
  }

  try {
    const repos = await listInstallationRepos(pending.accessToken, installationId, { search });
    return { repos, error: null };
  } catch (error) {
    return { repos: [], error: apiErrorMessage(error) };
  }
}

export async function connectRepo(
  projectId: string,
  installationId: number,
  owner: string,
  repo: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to connect a repository." };
  }

  const pending = await getPendingGithubConnection(projectId);
  if (!pending) {
    return { error: "Your GitHub sign-in expired. Start over." };
  }

  try {
    const repoDetails = await getRepo(pending.accessToken, owner, repo);

    await upsertGithubConnection({
      projectId,
      connectedBy: access.userId,
      githubLogin: pending.githubLogin,
      installationId,
      repoOwner: repoDetails.owner,
      repoName: repoDetails.name,
      defaultBranch: repoDetails.defaultBranch,
      accessToken: pending.accessToken,
      refreshToken: pending.refreshToken,
      accessTokenExpiresAt: pending.accessTokenExpiresAt,
      refreshTokenExpiresAt: pending.refreshTokenExpiresAt,
    });
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }

  await clearPendingGithubConnection();

  await logActivity({
    userId: access.userId,
    action: "github_repo_connected",
    projectId,
    entityType: "github_connection",
    details: { owner, repo },
  });

  revalidatePath(`/projects/${projectId}/files`);
  return { error: null };
}

export async function disconnectRepo(projectId: string): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access || !canManageProject(access.role)) {
    return { error: "You do not have permission to disconnect this repository." };
  }

  try {
    await deleteGithubConnection(projectId, access.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to disconnect." };
  }

  await logActivity({
    userId: access.userId,
    action: "github_repo_disconnected",
    projectId,
    entityType: "github_connection",
  });

  revalidatePath(`/projects/${projectId}/files`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Browsing + editing
// ---------------------------------------------------------------------------

export async function listRepoDirectory(
  projectId: string,
  path: string
): Promise<{ entries: GithubTreeEntry[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { entries: [], error: "You do not have access to this project." };

  const connection = await getProjectGithubToken(projectId, access.userId);
  if (!connection) return { entries: [], error: "No repository connected." };

  try {
    const entries = await listDirectory(
      connection.token,
      connection.repoOwner,
      connection.repoName,
      path,
      connection.defaultBranch
    );
    return { entries, error: null };
  } catch (error) {
    return { entries: [], error: apiErrorMessage(error) };
  }
}

/**
 * `content` is decoded UTF-8 text, except for image paths (detectFileKind)
 * where it stays raw base64 - the workspace feeds that straight into a
 * `data:` URL rather than trying to edit it as text.
 */
export async function getRepoFile(
  projectId: string,
  path: string,
  ref?: string
): Promise<{ content: string | null; sha: string | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { content: null, sha: null, error: "You do not have access to this project." };

  const connection = await getProjectGithubToken(projectId, access.userId);
  if (!connection) return { content: null, sha: null, error: "No repository connected." };

  try {
    const file = await getFile(
      connection.token,
      connection.repoOwner,
      connection.repoName,
      path,
      ref ?? connection.defaultBranch,
      { raw: detectFileKind({ name: path }) === "image" }
    );
    return { content: file.content, sha: file.sha, error: null };
  } catch (error) {
    return { content: null, sha: null, error: apiErrorMessage(error) };
  }
}

export interface CommitRepoFileOptions {
  branch: string;
  message: string;
  mode: "direct" | "pr";
  /** Required when mode is "pr". */
  newBranchName?: string;
}

export interface CommitRepoFileResult {
  error: string | null;
  sha: string | null;
  commitUrl: string | null;
  pullRequestUrl: string | null;
}

export async function commitRepoFile(
  projectId: string,
  path: string,
  content: string,
  currentSha: string,
  options: CommitRepoFileOptions
): Promise<CommitRepoFileResult> {
  const access = await getProjectAccess(projectId);
  if (!access || !canWriteProject(access.role)) {
    return {
      error: "You do not have permission to edit files in this project.",
      sha: null,
      commitUrl: null,
      pullRequestUrl: null,
    };
  }

  const connection = await getProjectGithubToken(projectId, access.userId);
  if (!connection) {
    return { error: "No repository connected.", sha: null, commitUrl: null, pullRequestUrl: null };
  }

  const { repoOwner, repoName, token } = connection;
  const message = options.message.trim() || `Update ${path}`;

  try {
    if (options.mode === "direct") {
      const result = await putFile(token, repoOwner, repoName, path, content, currentSha, options.branch, message);

      await logActivity({
        userId: access.userId,
        action: "github_file_committed",
        projectId,
        entityType: "github_file",
        details: { path, branch: options.branch, mode: "direct" },
      });

      revalidatePath(`/projects/${projectId}/files`);
      return { error: null, sha: result.sha, commitUrl: result.commitUrl, pullRequestUrl: null };
    }

    const newBranchName = options.newBranchName?.trim();
    if (!newBranchName) {
      return {
        error: "A new branch name is required to open a pull request.",
        sha: null,
        commitUrl: null,
        pullRequestUrl: null,
      };
    }

    const branches = await listBranches(token, repoOwner, repoName);
    const base = branches.find((b) => b.name === options.branch);
    if (!base) {
      return { error: `Branch "${options.branch}" not found.`, sha: null, commitUrl: null, pullRequestUrl: null };
    }

    await createBranch(token, repoOwner, repoName, newBranchName, base.commitSha);

    let result;
    try {
      result = await putFile(token, repoOwner, repoName, path, content, currentSha, newBranchName, message);
    } catch (error) {
      // Nothing of value exists on the branch yet - safe to remove it so a
      // retry doesn't immediately fail on "Reference already exists"
      // instead of the real problem. Best-effort: a failed cleanup here
      // must not hide the actual error from putFile.
      await deleteBranch(token, repoOwner, repoName, newBranchName).catch(() => {});
      throw error;
    }

    let pr;
    try {
      pr = await createPullRequest(token, repoOwner, repoName, newBranchName, options.branch, message);
    } catch (error) {
      // Unlike the putFile failure above, the commit itself DID succeed -
      // deleting the branch here would destroy real work. Leave it and
      // report what actually happened instead of a generic failure, so the
      // user knows their change is safe and just needs a PR opened by hand.
      return {
        error: `Committed to "${newBranchName}", but opening the pull request failed: ${apiErrorMessage(error)}. You can open one manually on GitHub.`,
        sha: result.sha,
        commitUrl: result.commitUrl,
        pullRequestUrl: null,
      };
    }

    await logActivity({
      userId: access.userId,
      action: "github_file_committed",
      projectId,
      entityType: "github_file",
      details: { path, branch: newBranchName, baseBranch: options.branch, mode: "pr", pullRequestUrl: pr.url },
    });

    revalidatePath(`/projects/${projectId}/files`);
    return { error: null, sha: result.sha, commitUrl: result.commitUrl, pullRequestUrl: pr.url };
  } catch (error) {
    return { error: apiErrorMessage(error), sha: null, commitUrl: null, pullRequestUrl: null };
  }
}
