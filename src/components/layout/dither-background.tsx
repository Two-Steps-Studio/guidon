"use client";

import { useSyncExternalStore } from "react";
import Dither from "@/components/Dither";

type EffectiveTheme = "light" | "dark";

/** Same rule as globals.css's `@custom-variant dark`: an explicit
 *  data-theme wins, otherwise the OS preference. */
function readTheme(): EffectiveTheme {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/**
 * The app-wide background: React Bits' Dither, one fixed WebGL canvas behind
 * every page (the layout keeps content above it at z-20).
 *
 * `backgroundColor="transparent"` dithers the wave over the page's own
 * background instead of painting an opaque rectangle, so the light/dark
 * palette in globals.css still shows through. Wave colors mirror the previous
 * hand-rolled canvas (lighter blue reads on near-black, deeper blue on white)
 * and are re-read whenever the theme changes, via useSyncExternalStore -
 * including the OS switch, which sets no data-theme attribute at all.
 *
 * Mouse interaction is off: the component listens on `window`, and a
 * cursor-reactive effect running over the whole app would compete with the
 * actual UI rather than sit behind it.
 */
const WAVE_COLOR: Record<EffectiveTheme, string> = { light: "#245bea", dark: "#8fb5ff" };

export function DitherBackground() {
  const theme = useSyncExternalStore<EffectiveTheme>(subscribeTheme, readTheme, () => "light");

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 opacity-100">
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
        enableMouseInteraction={false}
        clickRipple={false}
      />
    </div>
  );
}
