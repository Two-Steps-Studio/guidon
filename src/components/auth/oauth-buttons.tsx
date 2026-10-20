"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { OAuthProviderId, OAuthSetup } from "@/lib/auth/oauth-providers";

/**
 * Sign-in buttons for whichever providers this deployment has configured
 * (oauthSetup(), decided server-side by the login/signup page). Renders
 * nothing when none are enabled, so a password-only install shows no empty
 * divider.
 */
export function OAuthButtons({ setup, redirectTo = "/dashboard" }: { setup: OAuthSetup; redirectTo?: string }) {
  const { mode, providers } = setup;
  const [busy, setBusy] = useState<OAuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) return null;

  const signIn = async (id: OAuthProviderId) => {
    setBusy(id);
    setError(null);

    try {
      // Self-hosted: Guidon's own OAuth client (app/auth/oauth/[provider]).
      // A full page load, not router.push(): the route answers with a redirect
      // to the provider's site, which client-side navigation can't follow.
      if (mode === "local") {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a route handler that redirects off-site, see above
        window.location.assign(`${window.location.origin}/auth/oauth/${id}?redirect=${encodeURIComponent(redirectTo)}`);
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: id as "google" | "github" | "discord" | "gitlab",
        options: {
          // Supabase sends the user back here with a code to exchange.
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (signInError) throw signInError;
      // On success the browser is navigating away; no state update needed.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sign-in");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or continue with</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-2">
        {providers.map((provider) => (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void signIn(provider.id)}
          >
            {busy === provider.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ProviderMark id={provider.id} />
            )}
            {provider.label}
          </Button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Inline marks - avoids shipping an icon dependency for a few logos. */
function ProviderMark({ id }: { id: OAuthProviderId }) {
  if (id === "google") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z"
        />
        <path
          fill="#EA4335"
          d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
        />
      </svg>
    );
  }

  if (id === "discord") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#5865F2" aria-hidden>
        <path d="M20.3 4.5A19.8 19.8 0 0 0 15.4 3l-.2.5c1.7.4 2.5.9 3.4 1.6a11.6 11.6 0 0 0-4.3-1.4 12.9 12.9 0 0 0-4.6 0A11.6 11.6 0 0 0 5.4 5.1c.9-.7 1.8-1.2 3.4-1.6L8.6 3a19.8 19.8 0 0 0-4.9 1.5C1.3 8.2.6 11.8 1 15.3a19.9 19.9 0 0 0 6 3l1.2-1.7c-1-.4-1.9-.9-2.7-1.5l.6-.4a14.2 14.2 0 0 0 12 0l.6.4c-.8.6-1.7 1.1-2.7 1.5l1.2 1.7a19.9 19.9 0 0 0 6-3c.5-4-.7-7.6-2.9-10.8zM8.6 13.3c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4zm6.8 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4z" />
      </svg>
    );
  }

  if (id === "github") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-foreground" aria-hidden>
        <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
      </svg>
    );
  }

  if (id === "gitlab") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="#E24329" d="m12 22.1 4.4-13.6H7.6z" />
        <path fill="#FC6D26" d="M12 22.1 7.6 8.5H1.4z" />
        <path fill="#FCA326" d="M1.4 8.5.1 12.6a.9.9 0 0 0 .3 1L12 22.1z" />
        <path fill="#E24329" d="M1.4 8.5h6.2L4.9.3a.5.5 0 0 0-.9 0z" />
        <path fill="#FC6D26" d="m12 22.1 4.4-13.6h6.2z" />
        <path fill="#FCA326" d="m22.6 8.5 1.3 4.1a.9.9 0 0 1-.3 1L12 22.1z" />
        <path fill="#E24329" d="M22.6 8.5h-6.2L19.1.3a.5.5 0 0 1 .9 0z" />
      </svg>
    );
  }

  // Any OpenID Connect issuer (OIDC_NAME) - a generic key mark.
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} aria-hidden>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 9.8-9.8M17 6l3 3M15 8l2 2" strokeLinecap="round" />
    </svg>
  );
}
