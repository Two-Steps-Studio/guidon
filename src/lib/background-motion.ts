"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-device preference for the app-wide Dither background's animation.
 * "auto" follows the OS (`prefers-reduced-motion`), which on Windows is
 * switched on by "Animation effects: off", "Adjust for best performance" and
 * Remote Desktop - so people often have it without knowing, and saw a frozen
 * background. "on" animates regardless, "off" always shows a still frame.
 *
 * localStorage, not a profile column: it's about this screen and GPU, not the
 * account, and the background must not wait for a request to decide.
 */
export const BACKGROUND_MOTION_OPTIONS = ["auto", "on", "off"] as const;
export type BackgroundMotion = (typeof BACKGROUND_MOTION_OPTIONS)[number];

const STORAGE_KEY = "guidon-background-motion";
const CHANGE_EVENT = "guidon:background-motion";

function read(): BackgroundMotion {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return (BACKGROUND_MOTION_OPTIONS as readonly string[]).includes(value ?? "") ? (value as BackgroundMotion) : "auto";
  } catch {
    return "auto";
  }
}

function subscribe(onChange: () => void) {
  // "storage" covers other tabs, the custom event this one.
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useBackgroundMotion(): BackgroundMotion {
  return useSyncExternalStore(subscribe, read, () => "auto");
}

export function setBackgroundMotion(value: BackgroundMotion) {
  try {
    if (value === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked (private mode): the choice lasts until reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
