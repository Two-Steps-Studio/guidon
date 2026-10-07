import "server-only";

import { dataClient, serviceDataClient } from "@/lib/data-client";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { refreshUserToken } from "@/lib/github/client";

const GITHUB_TOKEN_KEY_INFO = "github-token-v1";
// Refresh a bit before the real expiry so a slow request never straddles it.
const REFRESH_SKEW_MS = 60_000;

/** Safe subset - no token. Fine to pass to a client component. */
export interface ProjectGithubRepoInfo {
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  githubLogin: string;
}

const SAFE_COLUMNS = "repo_owner, repo_name, default_branch, github_login";

/**
 * The repo a project is linked to, if any - never includes the token.
 * Used to render the Files page header ("Linked to owner/repo") and to
 * resolve owner/repo/branch for read-only browsing.
 */
export async function getProjectGithubRepoInfo(
  projectId: string,
  userId: string
): Promise<ProjectGithubRepoInfo | null> {
  const { data } = await dataClient(userId)
    .from<SafeRow>("github_connections")
    .select(SAFE_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();
  return data ? toRepoInfo(data) : null;
}

type SafeRow = { repo_owner: string; repo_name: string; default_branch: string; github_login: string };

function toRepoInfo(row: {
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  github_login: string;
}): ProjectGithubRepoInfo {
  return {
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    defaultBranch: row.default_branch,
    githubLogin: row.github_login,
  };
}

interface FullConnectionRow {
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  github_login: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
}

/**
 * Persists a freshly refreshed token pair. Runs as service_role rather than
 * the calling user, on purpose: the github_connections UPDATE policy (021)
 * only allows project owner/admin to write, but ANY project member can
 * trigger a refresh just by browsing files near the access token's expiry
 * (getProjectGithubToken is called from listRepoDirectory/getRepoFile behind
 * a plain getProjectAccess() check, not an owner/admin one). GitHub's
 * refresh tokens are single-use and are already rotated server-side by the
 * time refreshUserToken() above returns - if a non-admin member's write got
 * silently dropped by RLS here (which it did, before this fix: Supabase's
 * .update() error was never even checked), the old refresh_token_encrypted
 * left in the DB is already dead, permanently breaking the connection for
 * every member until someone reconnects it. The identity check that matters
 * (does this user have access to this project at all) already happened in
 * the caller before getProjectGithubToken() was reached; this write is
 * system-internal bookkeeping for a credential GitHub already rotated, not
 * a user-directed change to connection settings, so bypassing RLS for it
 * doesn't widen what any user can actually cause to happen.
 */
async function persistRefreshedTokens(
  projectId: string,
  refreshed: { accessToken: string; refreshToken: string; accessTokenExpiresAt: Date; refreshTokenExpiresAt: Date }
): Promise<void> {
  const { data, error } = await serviceDataClient()
    .from("github_connections")
    .update({
      access_token_encrypted: encryptSecret(refreshed.accessToken, GITHUB_TOKEN_KEY_INFO),
      refresh_token_encrypted: encryptSecret(refreshed.refreshToken, GITHUB_TOKEN_KEY_INFO),
      access_token_expires_at: refreshed.accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: refreshed.refreshTokenExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .select("project_id");

  if (error) throw new Error(`Failed to persist refreshed GitHub token: ${error.message}`);
  if (data.length === 0) {
    throw new Error(`Failed to persist refreshed GitHub token: no github_connections row for project ${projectId}`);
  }
}

/**
 * Full connection incl. a live access token. Server-only, and only ever
 * called from inside a Server Action / route handler that is about to call
 * the GitHub API directly - never returned to a client component.
 *
 * GitHub App user tokens expire (~8h): if the stored one is expired or
 * about to be, this transparently refreshes it (rotating the refresh token,
 * per GitHub's requirement) and persists the new pair before returning. If
 * the refresh token itself is dead, throws the same "reconnect" error a
 * dead access token would - callers already handle that via GithubApiError.
 */
export async function getProjectGithubToken(
  projectId: string,
  userId: string
): Promise<(ProjectGithubRepoInfo & { token: string }) | null> {
  // The token/refresh-token columns are no longer directly SELECT-able by
  // `authenticated` (025) - private.get_github_connection_secrets() is a
  // SECURITY DEFINER function that re-checks project access itself and
  // returns just those columns, closing the direct-PostgREST-query path a
  // plain column GRANT can't distinguish "the app needs this server-side"
  // from "any member can fetch this ciphertext directly."
  const db = dataClient(userId);
  const [safeResult, secretsResult] = await Promise.all([
    db.from<SafeRow>("github_connections").select(SAFE_COLUMNS).eq("project_id", projectId).maybeSingle(),
    db.rpcRows<{
      access_token_encrypted: string;
      refresh_token_encrypted: string;
      access_token_expires_at: string;
      refresh_token_expires_at: string;
    }>("get_github_connection_secrets", { p_project_id: projectId }),
  ]);
  if (safeResult.error) throw new Error(`Failed to read GitHub connection: ${safeResult.error.message}`);
  if (secretsResult.error) throw new Error(`Failed to read GitHub connection secrets: ${secretsResult.error.message}`);
  const safeRow = safeResult.data;
  const secrets = secretsResult.data[0] ?? null;

  if (!safeRow || !secrets) return null;
  const row: FullConnectionRow = { ...safeRow, ...secrets };

  const expiresAt = new Date(row.access_token_expires_at);
  if (Date.now() < expiresAt.getTime() - REFRESH_SKEW_MS) {
    return { ...toRepoInfo(row), token: decryptSecret(row.access_token_encrypted, GITHUB_TOKEN_KEY_INFO) };
  }

  const refreshToken = decryptSecret(row.refresh_token_encrypted, GITHUB_TOKEN_KEY_INFO);
  const refreshed = await refreshUserToken(refreshToken);
  await persistRefreshedTokens(projectId, refreshed);

  return { ...toRepoInfo(row), token: refreshed.accessToken };
}

export interface UpsertGithubConnectionInput {
  projectId: string;
  connectedBy: string;
  githubLogin: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

/**
 * Connects (or re-connects/changes) the repo linked to a project. upsertRow,
 * not an upsert: `ON CONFLICT DO UPDATE SET access_token_encrypted =
 * EXCLUDED...` needs a SELECT grant those columns deliberately don't have
 * (025), so connecting a repository failed with "permission denied" - see
 * upsertRow's comment.
 */
export async function upsertGithubConnection(input: UpsertGithubConnectionInput): Promise<void> {
  const { error } = await dataClient(input.connectedBy).upsertRow("github_connections", {
    key: { project_id: input.projectId },
    set: {
      connected_by: input.connectedBy,
      github_login: input.githubLogin,
      installation_id: input.installationId,
      repo_owner: input.repoOwner,
      repo_name: input.repoName,
      default_branch: input.defaultBranch,
      access_token_encrypted: encryptSecret(input.accessToken, GITHUB_TOKEN_KEY_INFO),
      refresh_token_encrypted: encryptSecret(input.refreshToken, GITHUB_TOKEN_KEY_INFO),
      access_token_expires_at: input.accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: input.refreshTokenExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  if (error) throw new Error(`Failed to save GitHub connection: ${error.message}`);
}

export async function deleteGithubConnection(projectId: string, userId: string): Promise<void> {
  const { error } = await dataClient(userId).from("github_connections").delete().eq("project_id", projectId);
  if (error) throw new Error(`Failed to disconnect GitHub repository: ${error.message}`);
}
