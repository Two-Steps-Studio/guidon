// No imports: loaded by tests/csp.test.mjs with Node's type stripping, and by next.config.ts.

/**
 * The one inline script that runs without a nonce: the module sandbox frame
 * (SANDBOX_FRAME_HTML in src/lib/work/module-sandbox.ts). A srcdoc frame
 * inherits this page's policy, so its script is allowed by hash.
 * tests/csp.test.mjs fails when the frame's script changes and this doesn't.
 */
export const SANDBOX_SCRIPT_HASH = "sha256-CRjxfsIVbkEknjZdplDNn1lWpABYOQecVLXgXKyexCA=";

function originOf(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

/**
 * Content-Security-Policy. With a nonce (pages, src/proxy.ts) scripts need
 * that nonce or the sandbox hash, and what they load is trusted through
 * 'strict-dynamic' - no 'unsafe-inline'. Without one (next.config.ts, for
 * static files the proxy skips) inline scripts are not allowed at all.
 * Styles keep 'unsafe-inline' for now: Radix positions popovers with inline styles.
 * - Supabase origin in connect/media/frame: browser-side Auth, and attachment
 *   previews (img/video/PDF iframe) from signed storage URLs in hosted mode.
 * - img-src https:: OAuth avatars come from whichever provider signed the user in.
 * - worker-src blob:: Monaco's editor workers and the module sandbox.
 * - No upgrade-insecure-requests: self-hosted installs may run plain HTTP behind
 *   their own proxy. Inline JSON-LD is data, not script, so CSP never blocks it.
 */
export function contentSecurityPolicy({
  nonce,
  isDev = false,
  supabaseUrl,
  posthogHost,
}: {
  nonce?: string;
  isDev?: boolean;
  supabaseUrl?: string;
  posthogHost?: string;
}): string {
  const supabase = originOf(supabaseUrl);
  const posthog = originOf(posthogHost);
  // posthog-js loads its extra bundles from the assets host next to the API host.
  const posthogAssets = posthog.replace(".i.", "-assets.i.");
  const list = (...sources: string[]) => sources.filter(Boolean).join(" ");

  return [
    `default-src 'self'`,
    `script-src ${list("'self'", nonce ? `'nonce-${nonce}' 'strict-dynamic' '${SANDBOX_SCRIPT_HASH}'` : "", posthogAssets, isDev ? "'unsafe-eval'" : "")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${list("'self'", supabase, posthog)}`,
    `media-src ${list("'self'", supabase)}`,
    `frame-src ${list("'self'", supabase)}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");
}
