/**
 * OAuth sign-in providers.
 *
 * Which buttons appear is driven by configuration, not hardcoded, so an
 * install that has not set a provider up simply does not offer it - rather
 * than showing a button that fails on click.
 *
 * Two mechanisms, decided by the install's mode:
 * - hosted (Supabase Auth): NEXT_PUBLIC_AUTH_PROVIDERS lists the Supabase
 *   providers switched on in the Supabase dashboard (docs/auth-setup.md);
 * - self-hosted (DATABASE_URL): Guidon's own OAuth/OIDC client, each provider
 *   on when its keys are in the environment (oauth-local-core.ts). The
 *   generic `oidc` one is how a Two Steps Studio account - or Keycloak,
 *   Authentik, Entra ID - signs in. It is optional by design: TODO.md §1
 *   requires self-hosted Guidon to work without any TSS account or server.
 */

import { localOAuthProviders, type LocalOAuthId } from "@/lib/auth/oauth-local-core";

export type OAuthProviderId = "google" | "github" | "discord" | "gitlab" | "oidc";

export interface OAuthButtonProvider {
  id: OAuthProviderId;
  label: string;
}

export interface OAuthSetup {
  /** `supabase`: signInWithOAuth; `local`: /auth/oauth/<id>. */
  mode: "supabase" | "local";
  providers: OAuthButtonProvider[];
}

/** Supabase's own provider names for the hosted buttons. */
const SUPABASE_PROVIDERS: Partial<Record<OAuthProviderId, OAuthButtonProvider>> = {
  google: { id: "google", label: "Google" },
  github: { id: "github", label: "GitHub" },
  discord: { id: "discord", label: "Discord" },
  gitlab: { id: "gitlab", label: "GitLab" },
};

/**
 * Server-side (login/signup pages): which buttons to show and how they work.
 *
 * Hosted: NEXT_PUBLIC_AUTH_PROVIDERS, a comma-separated list such as
 * `google,github,discord`. Empty or unset means password-only.
 */
export function oauthSetup(local: boolean): OAuthSetup {
  if (local) {
    return {
      mode: "local",
      providers: localOAuthProviders(process.env).map(({ id, label }) => ({ id: id as LocalOAuthId, label })),
    };
  }
  const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
    .split(",")
    .map((value) => SUPABASE_PROVIDERS[value.trim().toLowerCase() as OAuthProviderId])
    .filter((provider): provider is OAuthButtonProvider => Boolean(provider));
  return { mode: "supabase", providers: [...new Map(providers.map((p) => [p.id, p])).values()] };
}
