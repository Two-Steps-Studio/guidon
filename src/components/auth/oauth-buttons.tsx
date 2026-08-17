"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  enabledOAuthProviders,
  type OAuthProviderId,
} from "@/lib/auth/oauth-providers";

/**
 * Sign-in buttons for whichever providers this deployment has configured.
 * Renders nothing when none are enabled, so a password-only install shows no
 * empty divider.
 */
export function OAuthButtons({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const router = useRouter();
  const providers = enabledOAuthProviders();
  const [busy, setBusy] = useState<OAuthProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) return null;

  const signIn = async (id: OAuthProviderId) => {
    setBusy(id);
    setError(null);

    try {
      // Two Steps Studio is not a Supabase provider — it is Guidon's own
      // flow, handled by /auth/tss. See docs/auth-setup.md.
      if (id === "tss") {
        router.push(`/auth/tss?redirect=${encodeURIComponent(redirectTo)}`);
        return;
      }

      const provider = providers.find((p) => p.id === id)?.supabaseProvider;
      if (!provider) throw new Error("Provider is not configured");

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider,
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

/** Inline marks — avoids shipping an icon dependency for three logos. */
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

  return (
    <span
      aria-hidden
      className="flex h-4 w-4 items-center justify-center rounded-sm bg-primary text-[9px] font-bold text-primary-foreground"
    >
      T
    </span>
  );
}
