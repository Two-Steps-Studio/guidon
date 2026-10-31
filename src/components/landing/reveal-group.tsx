"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Marketing only: SSR remains readable, and keyboard navigation always settles motion. */
export function RevealGroup({ children, className, as: Tag = "div" }: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ol" | "ul";
}) {
  const ref = useRef<HTMLDivElement & HTMLOListElement & HTMLUListElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !window.IntersectionObserver || !Element.prototype.animate) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Map<Element, Animation>();
    let keyboard = false;
    const settle = () => {
      for (const animation of animations.values()) animation.finish();
      animations.clear();
    };
    const onKey = () => { keyboard = true; settle(); };
    const onVisibility = () => { if (document.hidden) settle(); };
    const ease = getComputedStyle(root).getPropertyValue("--ease-out").trim();
    const observer = new IntersectionObserver(entries => {
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (keyboard || document.hidden || entry.target.contains(document.activeElement)) continue;
        const frames = reduced.matches
          ? [{ opacity: .75 }, { opacity: 1 }]
          : [{ opacity: .65, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }];
        const animation = entry.target.animate(frames, {
          duration: reduced.matches ? 120 : 400,
          delay: reduced.matches ? 0 : Math.min(order++, 3) * 60,
          easing: ease || "cubic-bezier(0.23, 1, 0.32, 1)",
          fill: "backwards",
        });
        animations.set(entry.target, animation);
        animation.onfinish = () => animations.delete(entry.target);
      }
    }, { threshold: .1 });
    for (const child of root.children) observer.observe(child);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", settle);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", settle);
    return () => {
      observer.disconnect();
      for (const animation of animations.values()) animation.cancel();
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", settle);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", settle);
    };
  }, []);
  return <Tag ref={ref} className={className} data-reveal-group>{children}</Tag>;
}
