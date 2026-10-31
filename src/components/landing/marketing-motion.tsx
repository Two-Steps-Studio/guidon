"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./marketing-motion.module.css";

/** Progressive enhancement: the complete illustration is visible without JS. */
export function MarketingMotion({ children, kind }: { children: ReactNode; kind: "laptop" | "context" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !window.IntersectionObserver) return;
    let played = false;
    let visible = false;
    const pause = () => {
      node.dataset.paused = String(!visible || document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !played) { played = true; node.dataset.play = "true"; }
      pause();
    }, { threshold: 0.15 });
    observer.observe(node);
    document.addEventListener("visibilitychange", pause);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", pause); };
  }, []);
  return (
    <div ref={ref} data-marketing-motion={kind} className={styles.scene}>
      {children}
    </div>
  );
}
