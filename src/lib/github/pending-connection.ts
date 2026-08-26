import "server-only";

import { cookies } from "next/headers";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";

/**
 * Holds a freshly-obtained GitHub access token between the OAuth callback
 * and the repo-picker step (the user still has to choose *which* repo to
 * link before anything is written to github_connections). Httponly, signed
 * via the same AES-GCM box as the permanent token, short-lived, and scoped
 * to one project so it can't be replayed against a different one.
 */

const COOKIE_NAME = "guidon-github-pending";
const PENDING_TOKEN_KEY_INFO = "github-token-pending-v1";
const MAX_AGE_SECONDS = 10 * 60;

interface PendingConnection {
  projectId: string;
  githubLogin: string;
  tokenScope: string | null;
  encryptedToken: string;
}

export async function setPendingGithubConnection(input: {
  projectId: string;
  githubLogin: string;
  tokenScope: string | null;
  accessToken: string;
}): Promise<void> {
  const payload: PendingConnection = {
    projectId: input.projectId,
    githubLogin: input.githubLogin,
    tokenScope: input.tokenScope,
    encryptedToken: encryptSecret(input.accessToken, PENDING_TOKEN_KEY_INFO),
  };

  const store = await cookies();
  store.set(COOKIE_NAME, Buffer.from(JSON.stringify(payload)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

/** Returns the pending token for `projectId`, or null if absent/expired/mismatched. */
export async function getPendingGithubConnection(
  projectId: string
): Promise<{ githubLogin: string; tokenScope: string | null; accessToken: string } | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  let payload: PendingConnection;
  try {
    payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.projectId !== projectId) return null;

  try {
    return {
      githubLogin: payload.githubLogin,
      tokenScope: payload.tokenScope,
      accessToken: decryptSecret(payload.encryptedToken, PENDING_TOKEN_KEY_INFO),
    };
  } catch {
    return null;
  }
}

export async function clearPendingGithubConnection(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
