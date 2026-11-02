/**
 * Sidebar sections the person collapsed. A cookie, like the sidebar's own
 * `sidebar_state`, so app-shell.tsx renders the first paint already collapsed
 * (no jump after hydration).
 */
export const SIDEBAR_GROUPS_COOKIE = "sidebar_groups";

export function parseCollapsedGroups(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function writeCollapsedGroups(keys: readonly string[]) {
  document.cookie = `${SIDEBAR_GROUPS_COOKIE}=${encodeURIComponent(JSON.stringify(keys))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
