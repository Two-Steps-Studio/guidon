"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const Waves = dynamic(() => import("@/components/Waves"), { ssr: false });

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
 * Line opacity as a hex alpha suffix. The same alpha reads very differently
 * per theme: light-blue lines glow on the dark background but nearly vanish
 * on white, so light mode needs roughly twice the opacity for the same
 * presence.
 */
const LINE_ALPHA: Record<EffectiveTheme, string> = { light: "73", dark: "40" };

/**
 * Waves (React Bits) draws onto a <canvas> with a fixed strokeStyle string,
 * so CSS can't restyle it - the color is computed here from --color-primary
 * and re-computed whenever the effective theme changes (theme toggle or OS
 * switch), via useSyncExternalStore above. Falls back to the light-mode
 * value during SSR, where `document` doesn't exist.
 *
 * Deliberately ignores prefers-reduced-motion, unlike every other animation
 * in this app (see globals.css's own @media (prefers-reduced-motion: reduce)
 * block) and unlike this component's own first version. That gate made the
 * effect invisible whenever the OS/browser reports reduced motion - which
 * turned out to be the environment default here - silently defeating a
 * background explicitly requested for the landing page. Confirmed with the
 * user: they'd rather always see it.
 *
 * `className` is expected to carry positioning/opacity for the caller's
 * context - the landing page uses this both full-strength behind the hero
 * and faded behind the pricing section beneath it.
 */
export function WavesBackground({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore<EffectiveTheme>(subscribeTheme, readTheme, () => "light");
  const lineColor =
    typeof document !== "undefined"
      ? `${getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()}${LINE_ALPHA[theme]}`
      : `#1d4fd8${LINE_ALPHA.light}`;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <Waves
        lineColor={lineColor}
        backgroundColor="transparent"
        waveSpeedX={0.02}
        waveSpeedY={0.01}
        waveAmpX={40}
        waveAmpY={20}
        friction={0.9}
        tension={0.01}
        maxCursorMove={120}
        xGap={12}
        yGap={36}
      />
    </div>
  );
}
