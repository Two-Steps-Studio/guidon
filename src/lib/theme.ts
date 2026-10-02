export const SUPPORTED_THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof SUPPORTED_THEMES)[number];
export const DEFAULT_THEME: Theme = "system";
export const THEME_COOKIE = "theme";

export function isSupportedTheme(value: string): value is Theme {
  return (SUPPORTED_THEMES as readonly string[]).includes(value);
}
