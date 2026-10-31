"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A scroll-linked product illustration; the untransformed wrapper owns geometry. */
export function ScrollPreview({ children, className, direction=1 }: { children: ReactNode; className: string; direction?: 1 | -1 }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current, image = imageRef.current;
    if (!root || !image || !window.IntersectionObserver) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = matchMedia("(min-width: 768px)");
    let visible = false, keyboard = false, frame = 0;
    const settle = () => {
      cancelAnimationFrame(frame); frame = 0;
      image.style.transform = "";
      root.dataset.scrollProgress = "1";
    };
    const update = () => {
      frame = 0;
      if (reduced.matches || keyboard || document.hidden) { settle(); return; }
      const progress = Math.max(0, Math.min(1, (innerHeight * .95 - root.getBoundingClientRect().top) / (innerHeight * .6)));
      const remaining = 1 - progress;
      root.dataset.scrollProgress = progress.toFixed(3);
      if (progress === 1) { image.style.transform = ""; return; }
      image.style.transform = desktop.matches
        ? `perspective(1400px) translateX(${remaining * direction * 24}px) translateY(${remaining * 24}px) rotateX(${remaining * 12}deg) rotateY(${remaining * direction * -8}deg) scale(${1 - remaining * .08})`
        : `translateY(${remaining * 12}px) scale(${1 - remaining * .02})`;
    };
    const schedule = () => { if (visible && !frame) frame = requestAnimationFrame(update); };
    const onPreference = () => { if (reduced.matches) settle(); else schedule(); };
    const onKey = () => { keyboard = true; settle(); };
    const onVisibility = () => { if (document.hidden) settle(); else schedule(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) schedule(); else settle(); }, {rootMargin:"120px 0px"});
    observer.observe(root);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onPreference);
    desktop.addEventListener("change", schedule);
    return () => {
      observer.disconnect(); settle();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onPreference);
      desktop.removeEventListener("change", schedule);
    };
  }, [direction]);
  return <div ref={rootRef} data-product-preview className={className}>
    <div ref={imageRef} data-scroll-preview className="origin-center overflow-hidden rounded-xl border border-border bg-card shadow-xl">{children}</div>
  </div>;
}
