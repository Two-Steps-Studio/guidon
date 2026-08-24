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
 * Waves draws onto a <canvas> with a fixed strokeStyle string, so unlike CSS
 * it won't live-update if the user toggles theme afterward — same
 * fixed-aesthetic precedent as DarkVeil (src/components/DarkVeil.tsx). The
 * line color is read from --color-primary once per render, which still means
 * light vs dark mode each get the correct brand blue at first paint; falls
 * back to the light-mode value during SSR, where `document` doesn't exist.
 *
 * Same prefers-reduced-motion gate as HeroBackground
 * (src/components/layout/hero-background.tsx): renders nothing rather than
 * adding a check Waves' own source doesn't have.
 */
export function DashboardBackground() {
  const reducedMotion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (reducedMotion) return null;

  const lineColor =
    typeof document !== "undefined"
      ? `${getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()}33`
      : "#1d4fd833";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
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
