"use client";

import { useEffect, useRef } from "react";

const DARK_WAVE = "#8fb5ff";
const LIGHT_WAVE = "#245bea";

export function DitherBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dark = false;

    const getTheme = () => {
      const explicit = document.documentElement.getAttribute("data-theme");
      dark = explicit === "dark" || (explicit !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(bounds.width));
      height = Math.max(1, Math.floor(bounds.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      const wave = dark ? DARK_WAVE : LIGHT_WAVE;
      context.clearRect(0, 0, width, height);

      const step = 4;
      const maxDistance = Math.max(width, height) * 0.75;
      context.fillStyle = wave;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const waveX = x + Math.sin(y * 0.012 + time * 0.00035) * 90;
          const waveY = y + Math.cos(x * 0.009 + time * 0.00025) * 55;
          const distance = Math.hypot(waveX - width * 0.55, waveY - height * 0.42);
          const intensity = Math.max(0, 1 - distance / maxDistance);
          const ripple = (Math.sin(x * 0.07 + y * 0.035 + time * 0.001) + 1) / 2;
          const threshold = intensity * 0.34 + ripple * 0.16;
          if (threshold > 0.18) {
            context.globalAlpha = Math.min(0.34, threshold * (dark ? 0.72 : 0.38));
            context.fillRect(x, y, 2, 2);
          }
        }
      }
      context.globalAlpha = 1;
      animationFrame = requestAnimationFrame(draw);
    };

    getTheme();
    resize();
    animationFrame = requestAnimationFrame(draw);

    const observer = new MutationObserver(() => getTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", getTheme);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      media.removeEventListener("change", getTheme);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-80" />;
}
