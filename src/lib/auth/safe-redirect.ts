/**
 * Only same-site paths are accepted, so a `?redirect=` value cannot be
 * used to bounce a freshly authenticated user to another origin.
 *
 * Checked by parsing, not by pattern alone: URL parsing strips tabs and
 * newlines and reads "\" as "/", so "/\t/evil.com" or "/\evil.com" become
 * "//evil.com" - another site - although they start with a single "/".
 */
export function safeRedirect(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  // Control characters and backslashes have no business in our own paths.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/dashboard";
  const base = "https://same-origin.invalid";
  let parsed: URL;
  try {
    parsed = new URL(value, base);
  } catch {
    return "/dashboard";
  }
  if (parsed.origin !== base) return "/dashboard";
  return value;
}
