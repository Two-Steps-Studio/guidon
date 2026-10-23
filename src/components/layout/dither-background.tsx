"use client";

import { usePathname } from "next/navigation";
import Dither from "@/components/Dither";
import { useBackgroundMotion } from "@/lib/background-motion";
import { useWallpaperDim, useWallpaperUrl } from "@/lib/wallpaper";
import { useEffectiveTheme, type EffectiveTheme } from "@/lib/use-effective-theme";
import { BRAND_COLORS } from "@/lib/brand-colors";

/**
 * The app-wide background: React Bits' Dither, one fixed WebGL canvas behind
 * every page (the layout keeps content above it at z-20).
 *
 * `backgroundColor="transparent"` dithers the wave over the page's own
 * background instead of painting an opaque rectangle, so the light/dark
 * palette in globals.css still shows through. Wave colors mirror the previous
 * hand-rolled canvas (lighter blue reads on near-black, deeper blue on white)
 * and are re-read whenever the theme changes, via useEffectiveTheme -
 * including the OS switch, which sets no data-theme attribute at all.
 *
 * Mouse interaction is off: the component listens on `window`, and a
 * cursor-reactive effect running over the whole app would compete with the
 * actual UI rather than sit behind it.
 */
const WAVE_COLOR: Record<EffectiveTheme, string> = {
  light: BRAND_COLORS.blue,
  dark: BRAND_COLORS.electricBlue,
};

export function DitherBackground() {
  const pathname = usePathname();
  const theme = useEffectiveTheme();
  // Profile -> Background animation; "auto" leaves the OS reduced-motion
  // setting in charge (Dither then shows a still frame).
  const motion = useBackgroundMotion();
  // Profile -> Wallpaper (this device only) replaces the animation.
  const wallpaper = useWallpaperUrl();
  const dim = useWallpaperDim();

  // The public landing page owns its background. Keep device preferences
  // intact so they still apply when navigating back into the app.
  if (pathname === "/") return null;

  if (wallpaper) {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${wallpaper})` }} />
        {/* The page colour over the picture keeps text readable in both themes. */}
        <div className="absolute inset-0 bg-background" style={{ opacity: Number(dim) / 100 }} />
      </div>
    );
  }

  return (
    // h-lvh, not inset-0: the large viewport height doesn't change when a
    // phone's address bar slides away during scrolling, so the canvas isn't
    // resized - and the whole pattern re-scaled and shifted - on every scroll.
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh">
      <Dither
        waveColor={WAVE_COLOR[theme]}
        backgroundColor="transparent"
        ditherMode="bayer"
        colorNum={4}
        pixelSize={3}
        scale={1.2}
        waveSpeed={0.05}
        waveFrequency={2}
        waveAmplitude={0.3}
        disableAnimation={motion === "off"}
        ignoreReducedMotion={motion === "on"}
        enableMouseInteraction={false}
        clickRipple={false}
      />
    </div>
  );
}
