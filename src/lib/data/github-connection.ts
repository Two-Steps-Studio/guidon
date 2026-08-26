import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";

const GITHUB_TOKEN_KEY_INFO = "github-token-v1";

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

/**
 * Full connection incl. the decrypted access token. Server-only, and only
 * ever called from inside a Server Action / route handler that is about to
 * call the GitHub API directly - never returned to a client component.
 */
export async function getProjectGithubToken(
  projectId: string,
  userId: string
): Promise<(ProjectGithubRepoInfo & { token: string }) | null> {
  const columns = `${SAFE_COLUMNS}, access_token_encrypted`;

  if (hasDirectDatabase()) {
    const result = await withUser(userId, ({ query }) =>
      query(`SELECT ${columns} FROM github_connections WHERE project_id = $1`, [projectId])
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...toRepoInfo(row), token: decryptSecret(row.access_token_encrypted, GITHUB_TOKEN_KEY_INFO) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("github_connections")
    .select(columns)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...toRepoInfo(data),
    token: decryptSecret(data.access_token_encrypted, GITHUB_TOKEN_KEY_INFO),
  };
}

export interface UpsertGithubConnectionInput {
  projectId: string;
  connectedBy: string;
  githubLogin: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  accessToken: string;
  tokenScope?: string | null;
}

/** Connects (or re-connects/changes) the repo linked to a project. */
export async function upsertGithubConnection(input: UpsertGithubConnectionInput): Promise<void> {
  const encryptedToken = encryptSecret(input.accessToken, GITHUB_TOKEN_KEY_INFO);

  if (hasDirectDatabase()) {
    await withUser(input.connectedBy, ({ query }) =>
      query(
        `INSERT INTO github_connections
           (project_id, connected_by, github_login, repo_owner, repo_name, default_branch, access_token_encrypted, token_scope, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (project_id) DO UPDATE SET
           connected_by = EXCLUDED.connected_by,
           github_login = EXCLUDED.github_login,
           repo_owner = EXCLUDED.repo_owner,
           repo_name = EXCLUDED.repo_name,
           default_branch = EXCLUDED.default_branch,
           access_token_encrypted = EXCLUDED.access_token_encrypted,
           token_scope = EXCLUDED.token_scope,
           updated_at = now()`,
        [
          input.projectId,
          input.connectedBy,
          input.githubLogin,
          input.repoOwner,
          input.repoName,
          input.defaultBranch,
          encryptedToken,
          input.tokenScope ?? null,
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
      repo_owner: input.repoOwner,
      repo_name: input.repoName,
      default_branch: input.defaultBranch,
      access_token_encrypted: encryptedToken,
      token_scope: input.tokenScope ?? null,
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
