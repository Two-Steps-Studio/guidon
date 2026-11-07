"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { BRAND_COLORS } from "@/lib/brand-colors";
import { useBackgroundMotion } from "@/lib/background-motion";
import { useEffectiveTheme } from "@/lib/use-effective-theme";
import styles from "./landing.module.css";

const LaserFlow = dynamic(() => import("./laser-flow"), { ssr: false });

export function HeroLaser() {
  const theme = useEffectiveTheme();
  const motion = useBackgroundMotion();
  const mobile = useIsMobile();
  const surfaceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    surfaceRef.current = document.getElementById("product-preview-frame");
  }, []);

  return (
    <div aria-hidden="true" className={styles.heroLaser} data-hero-laser>
      <LaserFlow surfaceRef={surfaceRef} theme={theme} color={theme === "dark" ? BRAND_COLORS.electricBlue : BRAND_COLORS.blue}
        beamPosition={mobile ? 0.91 : 0.84} intensity={mobile ? 1.1 : 1.45}
        beamWidth={mobile ? 0.8 : 1.1} fog={mobile ? 0.3 : 0.5} speed={0.65}
        mouseInteraction={false} intro={false} paused={motion === "off"} dpr={1} />
    </div>
  );
}
