"use client";
import { createDevicePreference } from "@/lib/device-preference";
export const BACKGROUND_STYLES = ["solid", "pattern"] as const;
export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number];
const preference = createDevicePreference<BackgroundStyle>("guidon-background-style", BACKGROUND_STYLES, "solid");
export const useBackgroundStyle = preference.usePreference;
export const setBackgroundStyle = preference.set;
