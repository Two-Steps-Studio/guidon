// Only node:crypto: loaded by tests/auth/oauth.test.mjs with Node's type stripping.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Self-hosted "Sign in with ..." (DATABASE_URL set, no Supabase Auth to
 * delegate to): the pure parts of a small OAuth 2.0 / OpenID Connect client -
 * which providers are configured, the signed state cookie with its PKCE
 * verifier, and turning each provider's profile into one shape. The network
 * calls and the user lookup are in oauth-local.ts.
 *
 * Providers are switched on at runtime by their keys being present in the
 * environment (a self-hosted image is built once and configured by env), not
 * by the build-time NEXT_PUBLIC_AUTH_PROVIDERS the hosted mode uses.
 *
 * `oidc` is any OpenID Connect issuer - Keycloak, Authentik, Entra ID, or a
 * Two Steps Studio account once TSS runs an issuer - named by OIDC_NAME.
 */

export type LocalOAuthId = "google" | "github" | "discord" | "gitlab" | "oidc";

export const LOCAL_OAUTH_IDS: readonly LocalOAuthId[] = ["google", "github", "discord", "gitlab", "oidc"];

export interface LocalOAuthProvider {
  id: LocalOAuthId;
  label: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  /** Fixed endpoints; null for `oidc`, which reads them from its discovery document. */
  authorizeUrl: string | null;
  tokenUrl: string | null;
  userinfoUrl: string | null;
  /** `oidc` only: the issuer whose /.well-known/openid-configuration is read. */
  issuer: string | null;
}

type Env = Record<string, string | undefined>;

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** Every provider whose client id and secret are set, in a stable order. */
export function localOAuthProviders(env: Env): LocalOAuthProvider[] {
  const keys = (prefix: string) => {
    const clientId = env[`${prefix}_CLIENT_ID`]?.trim();
    const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  };
  const out: LocalOAuthProvider[] = [];

  const google = keys("GOOGLE");
  if (google) {
    out.push({
      id: "google",
      label: "Google",
      ...google,
      scope: "openid email profile",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      issuer: null,
    });
  }

  const github = keys("GITHUB_OAUTH");
  if (github) {
    out.push({
      id: "github",
      label: "GitHub",
      ...github,
      scope: "read:user user:email",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userinfoUrl: "https://api.github.com/user",
      issuer: null,
    });
  }

  const discord = keys("DISCORD_OAUTH");
  if (discord) {
    out.push({
      id: "discord",
      label: "Discord",
      ...discord,
      scope: "identify email",
      authorizeUrl: "https://discord.com/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      userinfoUrl: "https://discord.com/api/users/@me",
      issuer: null,
    });
  }

  const gitlab = keys("GITLAB");
  if (gitlab) {
    // GITLAB_URL for a self-managed GitLab; gitlab.com otherwise.
    const base = trimSlash(env.GITLAB_URL?.trim() || "https://gitlab.com");
    out.push({
      id: "gitlab",
      label: "GitLab",
      ...gitlab,
      scope: "openid email profile",
      authorizeUrl: `${base}/oauth/authorize`,
      tokenUrl: `${base}/oauth/token`,
      userinfoUrl: `${base}/oauth/userinfo`,
      issuer: null,
    });
  }

  const oidc = keys("OIDC");
  const issuer = env.OIDC_ISSUER?.trim();
  if (oidc && issuer) {
    out.push({
      id: "oidc",
      label: env.OIDC_NAME?.trim() || "Single sign-on",
      ...oidc,
      scope: "openid email profile",
      authorizeUrl: null,
      tokenUrl: null,
      userinfoUrl: null,
      issuer: trimSlash(issuer),
    });
  }

  return out;
}

// ---------------------------------------------------------------- state

const base64url = (buffer: Buffer) => buffer.toString("base64url");

/** A PKCE code verifier (RFC 7636): 43 url-safe characters. */
export function createCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function codeChallengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export interface OAuthState {
  provider: LocalOAuthId;
  /** Echoed by the provider and compared on return (CSRF). */
  state: string;
  verifier: string;
  /** Where to go after signing in (already passed through safeRedirect). */
  redirect: string;
  /** Unix seconds. */
  exp: number;
}

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function hmac(payload: string, secret: string): Buffer {
  return createHmac("sha256", `guidon-oauth-state:${secret}`).update(payload).digest();
}

/** `<payload>.<signature>`, both base64url - stored in a short-lived httpOnly cookie. */
export function signOAuthState(state: OAuthState, secret: string): string {
  const payload = base64url(Buffer.from(JSON.stringify(state)));
  return `${payload}.${base64url(hmac(payload, secret))}`;
}

export function verifyOAuthState(value: string | undefined | null, secret: string, now = Date.now()): OAuthState | null {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = hmac(payload, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof state.exp !== "number" || state.exp * 1000 < now) return null;
    if (!LOCAL_OAUTH_IDS.includes(state.provider)) return null;
    return state;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- profiles

export interface OAuthProfile {
  email: string | null;
  /** Only a verified address may sign in to, or create, a Guidon account. */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

type Json = Record<string, unknown>;

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * One shape from each provider's user endpoint. `githubEmails` is GitHub's
 * /user/emails list - its /user `email` is the public one, which may be
 * unset or unverified, so the primary verified address is taken from there.
 */
export function normalizeProfile(id: LocalOAuthId, user: Json, githubEmails: Json[] = []): OAuthProfile {
  switch (id) {
    case "github": {
      const primary = githubEmails.find((e) => e.primary === true && e.verified === true);
      return {
        email: str(primary?.email)?.toLowerCase() ?? null,
        emailVerified: Boolean(primary),
        name: str(user.name) ?? str(user.login),
        avatarUrl: str(user.avatar_url),
      };
    }
    case "discord": {
      const userId = str(user.id);
      const avatar = str(user.avatar);
      return {
        email: str(user.email)?.toLowerCase() ?? null,
        emailVerified: user.verified === true,
        name: str(user.global_name) ?? str(user.username),
        avatarUrl: userId && avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png` : null,
      };
    }
    default:
      // OpenID Connect userinfo (Google, GitLab, any OIDC issuer). A missing
      // email_verified counts as unverified - never assumed.
      return {
        email: str(user.email)?.toLowerCase() ?? null,
        emailVerified: user.email_verified === true || user.email_verified === "true",
        name: str(user.name) ?? str(user.preferred_username) ?? str(user.nickname),
        avatarUrl: str(user.picture),
      };
  }
}
