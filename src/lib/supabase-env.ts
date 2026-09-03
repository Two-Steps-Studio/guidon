/**
 * Shared by every place that hands NEXT_PUBLIC_SUPABASE_URL straight to a
 * Supabase SDK constructor (src/lib/supabase.ts, supabase-server.ts,
 * proxy.ts, api/api-key-auth.ts) - previously each read it with only a
 * presence check (or, in proxy.ts and api-key-auth.ts, no check at all, just
 * a bare `!` non-null assertion).
 *
 * The Supabase SDK does `new URL(path, supabaseUrl)` internally on every
 * request; a bare-domain value with no scheme (e.g. "xyz.supabase.co"
 * instead of "https://xyz.supabase.co" - the exact misconfiguration shape
 * that took down a production build via APP_URL/layout.tsx's metadataBase)
 * throws ERR_INVALID_URL deep inside the SDK's fetch layer instead of a
 * clear message. proxy.ts in particular matches nearly every route (Next's
 * middleware equivalent), so an unvalidated throw there isn't scoped to one
 * page the way the APP_URL crash was - it would take down every request.
 *
 * No `import "server-only"` here deliberately: src/lib/supabase.ts's browser
 * client is imported directly from "use client" components (login-form.tsx,
 * signup-form.tsx, oauth-buttons.tsx, logout-client.tsx), so this needs to
 * run in the client bundle too. NEXT_PUBLIC_* vars are inlined at build time
 * either way, so there's no secret-exposure concern in validating them
 * client-side.
 */
export function assertValidSupabaseUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: "${url}". Must be a full http(s) origin (e.g. https://your-project.supabase.co).`
    );
  }
}
