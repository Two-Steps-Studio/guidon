"use client";

import { useEffect, useRef } from "react";

const BACKGROUND = "#120f17";
const WAVE = "#6e99ed";
const LIGHT_BACKGROUND = "#f5f7fb";
const LIGHT_WAVE = "#315eb8";
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function DitherBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let width = 1;
    let height = 1;
    let dark = false;

    const readTheme = () => {
      const explicit = document.documentElement.getAttribute("data-theme");
      dark = explicit === "dark" || (explicit !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.ceil(bounds.width));
      height = Math.max(1, Math.ceil(bounds.height));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (time: number) => {
      const pixelSize = 3;
      const background = dark ? BACKGROUND : LIGHT_BACKGROUND;
      const wave = dark ? WAVE : LIGHT_WAVE;
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      context.fillStyle = wave;

      for (let y = 0; y < height; y += pixelSize) {
        for (let x = 0; x < width; x += pixelSize) {
          const nx = x / width;
          const ny = y / height;
          const waveA = Math.sin(nx * 12 + time * 0.0007 + Math.sin(ny * 5)) * 0.5 + 0.5;
          const waveB = Math.sin(ny * 10 - time * 0.00045 + nx * 4) * 0.5 + 0.5;
          const ridge = (waveA * 0.65 + waveB * 0.35) * 1.2;
          const threshold = BAYER[(y / pixelSize) % 4][(x / pixelSize) % 4] / 16;

          if (ridge > threshold) {
            context.globalAlpha = 0.16 + ridge * 0.42;
            context.fillRect(x, y, pixelSize, pixelSize);
          }
        }
      }

      context.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    readTheme();
    resize();
    frame = requestAnimationFrame(draw);
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", readTheme);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", readTheme);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
