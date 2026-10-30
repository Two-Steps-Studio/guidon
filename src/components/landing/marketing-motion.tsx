"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import styles from "./marketing-motion.module.css";

/** Progressive enhancement: the complete illustration is visible without JS. */
export function MarketingMotion({ children, replayLabel, kind }: { children: ReactNode; replayLabel: string; kind: "laptop" | "context" }) {
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
      <button type="button" className={styles.replay} aria-label={replayLabel} onClick={event => {
        // Keyboard activation never starts a choreographed sequence.
        const animations = ref.current?.getAnimations({ subtree: true }) ?? [];
        for (const animation of animations) {
          if (event.detail === 0) animation.finish();
          else { animation.currentTime = 0; animation.play(); }
        }
      }}><RotateCcw size={14} aria-hidden />{replayLabel}</button>
    </div>
  );
}
