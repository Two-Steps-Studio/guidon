"use client";

import { useSyncExternalStore } from "react";
import DarkVeil from "@/components/DarkVeil";

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
 * DarkVeil (React Bits) is a continuously-animating WebGL canvas with no
 * built-in prefers-reduced-motion check, unlike every other animation in
 * this app (see globals.css's own @media (prefers-reduced-motion: reduce)
 * block). This renders nothing at all for a user who has asked for less
 * motion, rather than adding a check DarkVeil's own generated source
 * doesn't have.
 *
 * useSyncExternalStore (not useState + useEffect) subscribes to the media
 * query directly — the idiomatic way to read external mutable state without
 * a setState-in-effect render pass, and getServerSnapshot keeps SSR/the
 * first paint safely defaulted to "reduced motion" until the real value is
 * known client-side.
 */
export function HeroBackground() {
  const reducedMotion = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (reducedMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 opacity-30">
      <DarkVeil hueShift={200} speed={0.3} />
    </div>
  );
}
