import "server-only";

import { withServiceRole } from "@/lib/db/session";
import { isAiAccountEmail } from "@/lib/ai-account-email";
import { normalizeProfile, type LocalOAuthProvider, type OAuthProfile } from "@/lib/auth/oauth-local-core";

/**
 * The network half of self-hosted OAuth sign-in (oauth-local-core.ts has the
 * rest): endpoint discovery, the code exchange, reading the profile, and
 * finding or creating the Guidon account it belongs to.
 */

const TIMEOUT_MS = 10_000;

interface Endpoints {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": "Guidon", ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body) {
    const reason = body && (body.error_description ?? body.error ?? body.message);
    throw new Error(`${new URL(url).host} answered ${response.status}${reason ? `: ${String(reason)}` : ""}`);
  }
  return body;
}

// Discovery documents rarely change; one read per process is enough.
const discovered = new Map<string, Promise<Endpoints>>();

export async function endpointsFor(provider: LocalOAuthProvider): Promise<Endpoints> {
  if (provider.authorizeUrl && provider.tokenUrl && provider.userinfoUrl) {
    return { authorizeUrl: provider.authorizeUrl, tokenUrl: provider.tokenUrl, userinfoUrl: provider.userinfoUrl };
  }
  const issuer = provider.issuer!;
  let pending = discovered.get(issuer);
  if (!pending) {
    pending = fetchJson(`${issuer}/.well-known/openid-configuration`).then((doc) => {
      const pick = (key: string) => {
        const value = doc[key];
        if (typeof value !== "string" || !value.startsWith("https://") && !value.startsWith("http://")) {
          throw new Error(`The OIDC issuer's discovery document has no ${key}.`);
        }
        return value;
      };
      return {
        authorizeUrl: pick("authorization_endpoint"),
        tokenUrl: pick("token_endpoint"),
        userinfoUrl: pick("userinfo_endpoint"),
      };
    });
    // A failed read must not stick - the issuer may just have been down.
    pending.catch(() => discovered.delete(issuer));
    discovered.set(issuer, pending);
  }
  return pending;
}

/** Exchanges the authorization code (with its PKCE verifier) and reads the user's profile. */
export async function fetchProfile(
  provider: LocalOAuthProvider,
  code: string,
  verifier: string,
  redirectUri: string
): Promise<OAuthProfile> {
  const endpoints = await endpointsFor(provider);
  const token = await fetchJson(endpoints.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code_verifier: verifier,
    }),
  });
  const accessToken = typeof token.access_token === "string" ? token.access_token : null;
  if (!accessToken) throw new Error("The provider did not return an access token.");

  const auth = { Authorization: `Bearer ${accessToken}` };
  const user = await fetchJson(endpoints.userinfoUrl, { headers: auth });
  if (provider.id === "github") {
    const emails = await fetch("https://api.github.com/user/emails", {
      headers: { ...auth, Accept: "application/json", "User-Agent": "Guidon" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }).then((response) => (response.ok ? response.json() : []));
    return normalizeProfile("github", user, Array.isArray(emails) ? emails : []);
  }
  return normalizeProfile(provider.id, user);
}

export type OAuthAccountResult = { userId: string; created: boolean } | { error: string };

/**
 * The account for a verified email: the existing one (so a password user can
 * also sign in with Google from then on), or a new one without a password.
 * Same rule Supabase applies with "link accounts with the same email" on.
 */
export async function findOrCreateOAuthUser(profile: OAuthProfile, providerId: string): Promise<OAuthAccountResult> {
  if (!profile.email || !profile.emailVerified) {
    return { error: "Your account there has no verified email address, so it can't be used to sign in here." };
  }
  // Reserved for AI accounts (lib/ai-account-email.ts).
  if (isAiAccountEmail(profile.email)) return { error: "This email address can't be used to sign in." };

  return withServiceRole(async ({ query }) => {
    const existing = await query("SELECT id FROM auth.users WHERE email = $1", [profile.email]);
    if (existing.rows.length > 0) return { userId: existing.rows[0].id as string, created: false };

    const metadata: Record<string, string> = { provider: providerId };
    if (profile.name) metadata.full_name = profile.name.slice(0, 100);
    if (profile.avatarUrl) metadata.avatar_url = profile.avatarUrl;
    const inserted = await query(
      `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       VALUES ($1, NULL, now(), $2::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [profile.email, JSON.stringify(metadata)]
    );
    if (inserted.rows.length > 0) return { userId: inserted.rows[0].id as string, created: true };
    // Lost a race with a parallel sign-in for the same address.
    const again = await query("SELECT id FROM auth.users WHERE email = $1", [profile.email]);
    return again.rows.length > 0
      ? { userId: again.rows[0].id as string, created: false }
      : { error: "Could not create your account. Try again." };
  });
}
