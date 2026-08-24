"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

const Waves = dynamic(() => import("@/components/Waves"), { ssr: false });

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return true;
}

/**
 * Waves (React Bits) draws onto a <canvas> with a fixed strokeStyle string,
 * unlike CSS it won't live-update if the user toggles theme afterward. The
 * line color is read from --color-primary once per render, which still
 * means light vs dark mode each get the correct brand blue at first paint;
 * falls back to the light-mode value during SSR, where `document` doesn't
 * exist.
 *
 * Continuously-animating canvas with no built-in prefers-reduced-motion
 * check, unlike every other animation in this app (see globals.css's own
 * @media (prefers-reduced-motion: reduce) block). This renders nothing at
 * all for a user who has asked for less motion, rather than adding a check
 * Waves' own generated source doesn't have.
 *
 * useSyncExternalStore (not useState + useEffect) subscribes to the media
 * query directly — the idiomatic way to read external mutable state without
 * a setState-in-effect render pass, and getServerSnapshot keeps SSR/the
 * first paint safely defaulted to "reduced motion" until the real value is
 * known client-side.
 *
 * `className` is expected to carry positioning/opacity for the caller's
 * context — the landing page uses this both full-strength behind the hero
 * and faded behind the pricing section beneath it.
 */
export function WavesBackground({ className = "" }: { className?: string }) {
  const reducedMotion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (reducedMotion) return null;

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
