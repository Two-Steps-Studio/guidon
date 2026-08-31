import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser, withServiceRole } from "@/lib/db/session";
import { createClient, createServiceClient } from "@/lib/supabase-server";
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
  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(`SELECT ${SAFE_COLUMNS} FROM github_connections WHERE project_id = $1`, [projectId])
    );
    const row = result.rows[0];
    return row ? toRepoInfo(row) : null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("github_connections")
    .select(SAFE_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error || !data) return null;
  return toRepoInfo(data);
}

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

const TOKEN_COLUMNS =
  "access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at";

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
  const encryptedAccess = encryptSecret(refreshed.accessToken, GITHUB_TOKEN_KEY_INFO);
  const encryptedRefresh = encryptSecret(refreshed.refreshToken, GITHUB_TOKEN_KEY_INFO);

  if (hasDirectDatabase()) {
    const result = await withServiceRole(({ query }) =>
      query(
        `UPDATE github_connections
           SET access_token_encrypted = $1, refresh_token_encrypted = $2,
               access_token_expires_at = $3, refresh_token_expires_at = $4, updated_at = now()
         WHERE project_id = $5`,
        [
          encryptedAccess,
          encryptedRefresh,
          refreshed.accessTokenExpiresAt.toISOString(),
          refreshed.refreshTokenExpiresAt.toISOString(),
          projectId,
        ]
      )
    );
    if (result.rowCount === 0) {
      throw new Error(`Failed to persist refreshed GitHub token: no github_connections row for project ${projectId}`);
    }
    return;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("github_connections")
    .update({
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh,
      access_token_expires_at: refreshed.accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: refreshed.refreshTokenExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .select("project_id");

  if (error) throw new Error(`Failed to persist refreshed GitHub token: ${error.message}`);
  if (!data || data.length === 0) {
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
  const columns = `${SAFE_COLUMNS}, ${TOKEN_COLUMNS}`;

  let row: FullConnectionRow | null = null;

  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(`SELECT ${columns} FROM github_connections WHERE project_id = $1`, [projectId])
    );
    row = result.rows[0] ?? null;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("github_connections")
      .select(columns)
      .eq("project_id", projectId)
      .maybeSingle();
    row = error ? null : data;
  }

  if (!row) return null;

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

/** Connects (or re-connects/changes) the repo linked to a project. */
export async function upsertGithubConnection(input: UpsertGithubConnectionInput): Promise<void> {
  const encryptedAccess = encryptSecret(input.accessToken, GITHUB_TOKEN_KEY_INFO);
  const encryptedRefresh = encryptSecret(input.refreshToken, GITHUB_TOKEN_KEY_INFO);

  if (hasDirectDatabase()) {
    await withUser(input.connectedBy, ({ query }) =>
      query(
        `INSERT INTO github_connections
           (project_id, connected_by, github_login, installation_id, repo_owner, repo_name, default_branch,
            access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         ON CONFLICT (project_id) DO UPDATE SET
           connected_by = EXCLUDED.connected_by,
           github_login = EXCLUDED.github_login,
           installation_id = EXCLUDED.installation_id,
           repo_owner = EXCLUDED.repo_owner,
           repo_name = EXCLUDED.repo_name,
           default_branch = EXCLUDED.default_branch,
           access_token_encrypted = EXCLUDED.access_token_encrypted,
           refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
           access_token_expires_at = EXCLUDED.access_token_expires_at,
           refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
           updated_at = now()`,
        [
          input.projectId,
          input.connectedBy,
          input.githubLogin,
          input.installationId,
          input.repoOwner,
          input.repoName,
          input.defaultBranch,
          encryptedAccess,
          encryptedRefresh,
          input.accessTokenExpiresAt.toISOString(),
          input.refreshTokenExpiresAt.toISOString(),
        ]
      )
    );
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("github_connections").upsert(
    {
      project_id: input.projectId,
      connected_by: input.connectedBy,
      github_login: input.githubLogin,
      installation_id: input.installationId,
      repo_owner: input.repoOwner,
      repo_name: input.repoName,
      default_branch: input.defaultBranch,
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh,
      access_token_expires_at: input.accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: input.refreshTokenExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" }
  );

  if (error) throw new Error(`Failed to save GitHub connection: ${error.message}`);
}

export async function deleteGithubConnection(projectId: string, userId: string): Promise<void> {
  if (hasDirectDatabase()) {
    await withUser(userId, ({ query }) =>
      query("DELETE FROM github_connections WHERE project_id = $1", [projectId])
    );
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("github_connections").delete().eq("project_id", projectId);
  if (error) throw new Error(`Failed to disconnect GitHub repository: ${error.message}`);
}
