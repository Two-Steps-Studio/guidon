import { Platform, useColorScheme, type ViewStyle } from "react-native";

/**
 * Design tokens. Colours follow the web app's palette (src/app/globals.css
 * in the main repo) so the phone and the browser read as one product.
 */

const light = {
  background: "#f2f4f7",
  surface: "#ffffff",
  surfaceMuted: "#eef1f5",
  surfacePressed: "#e4e8ee",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  border: "#e2e8f0",
  primary: "#1d4fd8",
  onPrimary: "#ffffff",
  danger: "#dc2626",
  success: "#059669",
  warning: "#d97706",
  info: "#2563eb",
  overlay: "rgba(15, 23, 42, 0.35)",
  bannerOffline: "#fef3c7",
  onBannerOffline: "#78350f",
  priority: { low: "#64748b", medium: "#2563eb", high: "#d97706", critical: "#dc2626" },
};

const dark: typeof light = {
  background: "#0b0d10",
  surface: "#16191f",
  surfaceMuted: "#1c1f26",
  surfacePressed: "#242832",
  text: "#e8eaed",
  textMuted: "#8b93a1",
  textFaint: "#5d6470",
  border: "#23272f",
  primary: "#4d8dff",
  onPrimary: "#06121f",
  danger: "#f87171",
  success: "#34d399",
  warning: "#fbbf24",
  info: "#60a5fa",
  overlay: "rgba(0, 0, 0, 0.55)",
  bannerOffline: "#3a2a06",
  onBannerOffline: "#fde68a",
  priority: { low: "#8b93a1", medium: "#60a5fa", high: "#fbbf24", critical: "#f87171" },
};

export type Colors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { card: 18, sheet: 28, control: 12, pill: 999 } as const;

export const typography = {
  largeTitle: { fontSize: 34, fontWeight: "700" as const },
  title: { fontSize: 22, fontWeight: "700" as const },
  headline: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 17 },
  callout: { fontSize: 16 },
  subhead: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
};

/**
 * Radius for a surface nested inside another: inner = outer - padding, so the
 * curves stay concentric. Never below a small floor so the inner shape still
 * reads as rounded.
 */
export function concentricRadius(outer: number, padding: number, min = 4): number {
  return Math.max(min, outer - padding);
}

/** Continuous ("squircle") corners on iOS; Android ignores borderCurve. */
export function rounded(r: number): ViewStyle {
  return Platform.OS === "ios" ? { borderRadius: r, borderCurve: "continuous" } : { borderRadius: r };
}

export type Theme = { dark: boolean; colors: Colors };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return { dark: isDark, colors: isDark ? dark : light };
}

/** Readable text colour (dark or white) on top of an arbitrary hex background. */
export function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#0f172a" : "#ffffff";
}
