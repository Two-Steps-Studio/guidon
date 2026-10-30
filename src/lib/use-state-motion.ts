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
    const node = ref.current;
    const current = animation.current?.playState === "running" && node ? getComputedStyle(node) : null;
    const opacity = current?.opacity ?? .7;
    const transform = current?.transform ?? "translateY(2%)";
    animation.current?.cancel();
    if (!changed || !pointer.current || !node) return;
    const easing = getComputedStyle(node).getPropertyValue("--ease-out").trim();
    animation.current = node.animate(reduce ? [{opacity},{opacity:1}] : [
      {opacity, transform}, {opacity:1, transform:"translateY(0)"},
    ], {duration:reduce ? 120 : 180, easing});
  }, [value, reduce]);
  useEffect(() => () => { animation.current?.cancel(); }, []);
  return {
    ref,
    inputHandlers: {
      onPointerDownCapture: () => { pointer.current = true; },
      onKeyDownCapture: () => { pointer.current = false; animation.current?.cancel(); },
    },
  };
}
