/**
 * Only same-site paths are accepted, so a `?redirect=` value cannot be
 * used to bounce a freshly authenticated user to another origin.
 */
export function safeRedirect(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
