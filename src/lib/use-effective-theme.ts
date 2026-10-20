"use client";

import { useSyncExternalStore } from "react";

export type EffectiveTheme = "light" | "dark";

/** Same rule as globals.css's `@custom-variant dark`: an explicit
 *  data-theme wins, otherwise the OS preference. */
function readTheme(): EffectiveTheme {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/**
 * The page's light/dark theme, live: both the app's own theme switcher
 * (data-theme on <html>, no OS change involved) and the OS setting when the
 * switcher is on "system". For things that can't follow the CSS variables -
 * a WebGL canvas, Monaco's and Prism's own themes.
 */
export function useEffectiveTheme(): EffectiveTheme {
  return useSyncExternalStore<EffectiveTheme>(subscribeTheme, readTheme, () => "light");
}
