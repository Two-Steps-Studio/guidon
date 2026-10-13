// No imports: loaded by tests/game-report.test.mjs with Node's type stripping.

/**
 * Allowed origins for a browser-embedded API key (migration 054) - the web
 * bug-report widget's key can be limited to the sites it's installed on.
 * Stored and compared as URL origins: scheme + host + port, lowercase, no
 * path ("https://shop.example.com", "http://localhost:3000").
 */

export const MAX_ALLOWED_ORIGINS = 10;

export type OriginsResult = { ok: true; value: string[] } | { ok: false; error: string };

/**
 * Parses what a user typed (comma/space/newline separated). Bare hosts get
 * https:// - nobody means plain http for a public site, and localhost has to
 * be written with its scheme and port anyway.
 */
export function parseAllowedOrigins(input: string): OriginsResult {
  const parts = input.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
  const origins: string[] = [];
  for (const part of parts) {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(part) ? part : `https://${part}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      return { ok: false, error: `"${part}" is not a valid site address.` };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, error: `"${part}" must be an http(s) address.` };
    }
    if (url.username || url.password) {
      return { ok: false, error: `"${part}" must not contain a username or password.` };
    }
    if (!origins.includes(url.origin)) origins.push(url.origin);
  }
  if (origins.length > MAX_ALLOWED_ORIGINS) {
    return { ok: false, error: `At most ${MAX_ALLOWED_ORIGINS} sites per key.` };
  }
  return { ok: true, value: origins };
}

/**
 * No list (null/empty) allows every origin, as keys did before 054. With a
 * list, the request's Origin header must match one entry exactly; a request
 * without Origin (not from a browser page) is refused, since a browser
 * always sends it on a cross-origin POST.
 */
export function isOriginAllowed(origin: string | null, allowed: readonly string[] | null): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!origin) return false;
  return allowed.includes(origin.toLowerCase());
}
