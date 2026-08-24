"use client";

import { useEffect, useState } from "react";
import DarkVeil from "@/components/DarkVeil";

/**
 * DarkVeil (React Bits) is a continuously-animating WebGL canvas with no
 * built-in prefers-reduced-motion check, unlike every other animation in
 * this app (see globals.css's own @media (prefers-reduced-motion: reduce)
 * block). This renders nothing at all for a user who has asked for less
 * motion, rather than adding a check DarkVeil's own generated source
 * doesn't have.
 */
export function HeroBackground() {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  if (reducedMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 opacity-30">
      <DarkVeil hueShift={200} speed={0.3} />
    </div>
  );
}
