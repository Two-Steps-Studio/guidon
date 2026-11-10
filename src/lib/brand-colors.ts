/** Brand palette from docs/brand-kit.md, for non-CSS surfaces and generated assets. */
export const BRAND_COLORS = {
  blue: "#1D4FD8",
  electricBlue: "#4D8DFF",
  midnightNavy: "#07142D",
  white: "#FFFFFF",
  ink: "#0F172A",
} as const;

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A button filled with the project's own colour: the text is white or navy,
 * whichever reads better on it (WCAG contrast), instead of the theme's
 * primary-foreground, which was navy-on-blue in dark mode.
 */
export function projectColorFill(color: string | null | undefined): { backgroundColor: string; color: string } | undefined {
  if (!color || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return undefined;
  const bg = luminance(color);
  const onWhite = 1.05 / (bg + 0.05);
  const onNavy = (bg + 0.05) / (luminance(BRAND_COLORS.midnightNavy) + 0.05);
  return { backgroundColor: color, color: onWhite >= onNavy ? BRAND_COLORS.white : BRAND_COLORS.midnightNavy };
}
