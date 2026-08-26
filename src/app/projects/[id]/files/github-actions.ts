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
  getFile,
  getRepo,
  listBranches,
  listDirectory,
  listInstallationRepos,
  listUserInstallations,
  putFile,
  type GithubBranch,
  type GithubInstallationSummary,
  type GithubRepoSummary,
  type GithubTreeEntry,
} from "@/lib/github/client";
import { getPendingGithubConnection, clearPendingGithubConnection } from "@/lib/github/pending-connection";

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
      ref ?? connection.defaultBranch
    );
    return { content: file.content, sha: file.sha, error: null };
  } catch (error) {
    return { content: null, sha: null, error: apiErrorMessage(error) };
  }
}

export async function listRepoBranches(
  projectId: string
): Promise<{ branches: GithubBranch[]; defaultBranch: string | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { branches: [], defaultBranch: null, error: "You do not have access to this project." };

  const connection = await getProjectGithubToken(projectId, access.userId);
  if (!connection) return { branches: [], defaultBranch: null, error: "No repository connected." };

  try {
    const branches = await listBranches(connection.token, connection.repoOwner, connection.repoName);
    return { branches, defaultBranch: connection.defaultBranch, error: null };
  } catch (error) {
    return { branches: [], defaultBranch: null, error: apiErrorMessage(error) };
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
    const result = await putFile(
      token,
      repoOwner,
      repoName,
      path,
      content,
      currentSha,
      newBranchName,
      message
    );
    const pr = await createPullRequest(
      token,
      repoOwner,
      repoName,
      newBranchName,
      options.branch,
      message
    );

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
