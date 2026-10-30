"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";

/** Occasional state changes only; keyboard updates and focus remain immediate. */
export function useStateMotion<T extends HTMLElement>(value: unknown) {
  const ref = useRef<T>(null);
  const previous = useRef(value);
  const pointer = useRef(false);
  const animation = useRef<Animation | null>(null);
  const reduce = useReducedMotionPreference();
  useEffect(() => {
    const changed = previous.current !== value;
    previous.current = value;
    animation.current?.cancel();
    if (!changed || !pointer.current || !ref.current) return;
    const easing = getComputedStyle(ref.current).getPropertyValue("--ease-out").trim();
    animation.current = ref.current.animate(reduce ? [{opacity:.7},{opacity:1}] : [
      {opacity:.7, transform:"translateY(2%)"}, {opacity:1, transform:"translateY(0)"},
    ], {duration:reduce ? 120 : 180, easing});
    return () => animation.current?.cancel();
  }, [value, reduce]);
  return {
    ref,
    inputHandlers: {
      onPointerDownCapture: () => { pointer.current = true; },
      onKeyDownCapture: () => { pointer.current = false; animation.current?.cancel(); },
    },
  };
}
