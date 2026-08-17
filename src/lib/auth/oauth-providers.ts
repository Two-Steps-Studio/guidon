/**
 * OAuth sign-in providers.
 *
 * Which buttons appear is driven by configuration, not hardcoded, so an
 * install that has not set a provider up simply does not offer it — rather
 * than showing a button that fails on click.
 *
 * `guidon-tss` is Guidon-specific: signing in with a Two Steps Studio account.
 * It is deliberately optional. TODO.md §1 requires self-hosted Guidon to work
 * when the user has no TSS account and when TSS servers are unreachable, so it
 * must never be the only way in.
 */

export type OAuthProviderId = "google" | "discord" | "tss";

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  /** Supabase provider name; absent for TSS, which is not a Supabase provider. */
  supabaseProvider?: "google" | "discord";
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  google: {
    id: "google",
    label: "Google",
    supabaseProvider: "google",
  },
  discord: {
    id: "discord",
    label: "Discord",
    supabaseProvider: "discord",
  },
  tss: {
    id: "tss",
    label: "Two Steps Studio",
  },
};

/**
 * Providers enabled for this deployment.
 *
 * Read from NEXT_PUBLIC_AUTH_PROVIDERS as a comma-separated list, e.g.
 *
 *   NEXT_PUBLIC_AUTH_PROVIDERS=google,discord,tss
 *
 * Empty or unset means password-only, which is the correct default for a
 * fresh self-hosted install with nothing configured yet.
 */
export function enabledOAuthProviders(): OAuthProviderConfig[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "";

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is OAuthProviderId => value in OAUTH_PROVIDERS)
    .map((id) => OAUTH_PROVIDERS[id]);
}
