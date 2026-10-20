"use client";

import { createDevicePreference } from "@/lib/device-preference";

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

const preference = createDevicePreference<BackgroundMotion>("guidon-background-motion", BACKGROUND_MOTION_OPTIONS, "auto");

export const useBackgroundMotion = preference.usePreference;
export const setBackgroundMotion = preference.set;
