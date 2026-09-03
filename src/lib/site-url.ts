import "server-only";

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
function normalizeSiteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const SITE_URL = normalizeSiteUrl(process.env.APP_URL?.trim() || DEFAULT_SITE_URL);
