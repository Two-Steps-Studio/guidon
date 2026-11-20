import "server-only";
import { normalizeSiteUrl } from "@/lib/oauth/oauth-core";

const DEFAULT_SITE_URL = "https://useguidon.com";

/**
 * APP_URL is expected to be a full origin ("https://useguidon.com"), but a
 * bare domain ("useguidon.com" - a easy typo/omission when setting an env
 * var in a hosting provider's dashboard) is normalized rather than trusted
 * as-is: layout.tsx's `new URL(SITE_URL)` (for metadataBase) throws
 * ERR_INVALID_URL on a schemeless value, which took the entire production
 * build down (ERR_INVALID_URL, "Failed to collect page data for
 * /_not-found") rather than degrading gracefully - and robots.ts/sitemap.ts,
 * which only ever string-concatenate this value, would otherwise silently
 * emit a schemeless, technically-invalid sitemap/robots.txt instead of
 * either crashing or working correctly.
 */
export const SITE_URL = normalizeSiteUrl(process.env.APP_URL?.trim() || DEFAULT_SITE_URL);

/**
 * The public origin for redirects and OAuth callbacks: APP_URL when set, else
 * the request's own origin. Behind a reverse proxy or tunnel the request URL
 * is the internal address (http://app:3000), so it is only the fallback for a
 * setup without APP_URL - never SITE_URL's useguidon.com default.
 */
export function appOrigin(request: Request): string {
  return process.env.APP_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
}
