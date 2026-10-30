"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Dither from "@/components/Dither";
import { useBackgroundMotion } from "@/lib/background-motion";
import { useWallpaperDim, useWallpaperUrl } from "@/lib/wallpaper";
import { useEffectiveTheme, type EffectiveTheme } from "@/lib/use-effective-theme";
import { BRAND_COLORS } from "@/lib/brand-colors";
import { useBackgroundStyle } from "@/lib/background-style";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";

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
  const style = useBackgroundStyle();
  const reduceMotion = useReducedMotionPreference();
  const patternRef = useRef<HTMLDivElement>(null);

  // The landing page always uses the branded Dither. Keep device preferences
  // intact so they still apply when navigating back into the app.
  const isLandingPage = pathname === "/";
  const showPattern = isLandingPage || (!wallpaper && style === "pattern");
  const canMove = motion !== "off" && (motion === "on" || !reduceMotion);

  useEffect(() => {
    const pattern = patternRef.current;
    if (!pattern || !showPattern || !canMove) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      const progress = range > 0 ? Math.max(0, Math.min(1, window.scrollY / range)) : 0;
      pattern.style.transform = `translate3d(${16 * progress}px, ${-32 * progress}px, 0)`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      pattern.style.transform = "";
    };
  }, [showPattern, canMove, pathname]);

  if (!isLandingPage && wallpaper) {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 min-h-lvh">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${wallpaper})` }} />
        {/* The page colour over the picture keeps text readable in both themes. */}
        <div className="absolute inset-0 bg-background" style={{ opacity: Number(dim) / 100 }} />
      </div>
    );
  }

  if (!isLandingPage && style === "solid") return null;
  return (
    // The viewport layer covers even the bottom of long settings pages.
    // Overscan keeps the small scroll translation from exposing empty edges.
    <div data-app-background aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 min-h-lvh overflow-hidden">
      <div ref={patternRef} data-background-pattern className="absolute -inset-8">
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
    </div>
  );
}
