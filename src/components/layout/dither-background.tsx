"use client";

import { useEffect, useRef } from "react";

const DARK_WAVE = "#6ea3ff";
const LIGHT_WAVE = "#1d4fd8";

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
    let particles: Array<{ x: number; y: number; size: number; speed: number; phase: number }> = [];

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

      const columns = Math.ceil(width / 34);
      const rows = Math.ceil(height / 34);
      const random = (seed: number) => {
        const value = Math.sin(seed * 12.9898) * 43758.5453;
        return value - Math.floor(value);
      };
      particles = Array.from({ length: columns * rows }, (_, index) => ({
        x: (index % columns) * 34 + random(index + 1) * 28,
        y: Math.floor(index / columns) * 34 + random(index + 101) * 28,
        size: 1 + random(index + 201) * 3,
        speed: 0.35 + random(index + 301) * 0.9,
        phase: random(index + 401) * Math.PI * 2,
      }));
    };

    const draw = (time: number) => {
      const wave = dark ? DARK_WAVE : LIGHT_WAVE;
      context.clearRect(0, 0, width, height);
      context.fillStyle = wave;

      for (const particle of particles) {
        const driftX = Math.sin(time * 0.00045 * particle.speed + particle.phase) * 24;
        const driftY = Math.cos(time * 0.00032 * particle.speed + particle.phase) * 18;
        const x = particle.x + driftX;
        const y = particle.y + driftY;
        const distance = Math.hypot(x - width * 0.52, y - height * 0.42);
        const glow = Math.max(0, 1 - distance / (Math.max(width, height) * 0.9));
        const pulse = (Math.sin(time * 0.0012 * particle.speed + particle.phase) + 1) / 2;

        if (glow > 0.04) {
          context.globalAlpha = Math.min(0.5, 0.08 + glow * 0.3 + pulse * 0.12);
          context.fillRect(x, y, particle.size, particle.size);
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

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-90" />;
}
