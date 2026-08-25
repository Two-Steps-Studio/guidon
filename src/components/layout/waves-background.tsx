"use client";

import dynamic from "next/dynamic";

const Waves = dynamic(() => import("@/components/Waves"), { ssr: false });

/**
 * Waves (React Bits) draws onto a <canvas> with a fixed strokeStyle string,
 * unlike CSS it won't live-update if the user toggles theme afterward. The
 * line color is read from --color-primary once per render, which still
 * means light vs dark mode each get the correct brand blue at first paint;
 * falls back to the light-mode value during SSR, where `document` doesn't
 * exist.
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
  const lineColor =
    typeof document !== "undefined"
      ? `${getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()}40`
      : "#1d4fd840";

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
