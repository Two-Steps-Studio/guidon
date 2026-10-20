"use client";

import { createDevicePreference } from "@/lib/device-preference";

/**
 * Small interface sounds, synthesized with Web Audio - no audio files to
 * load, and each one is a few short sine/triangle notes at low volume so
 * they confirm an action without competing with whatever the person is
 * listening to. On by default; Profile -> Sounds turns them off per device.
 */
export const SOUND_OPTIONS = ["on", "off"] as const;
export type SoundSetting = (typeof SOUND_OPTIONS)[number];

const preference = createDevicePreference<SoundSetting>("guidon-sounds", SOUND_OPTIONS, "on");
export const useSoundSetting = preference.usePreference;
export const setSoundSetting = preference.set;

export type SoundName = "complete" | "create" | "notify" | "error";

type Note = { frequency: number; start: number; duration: number; type?: OscillatorType; gain?: number };

const SOUNDS: Record<SoundName, Note[]> = {
  // Rising major third + fifth: "done".
  complete: [
    { frequency: 659.25, start: 0, duration: 0.12 },
    { frequency: 830.61, start: 0.07, duration: 0.12 },
    { frequency: 987.77, start: 0.14, duration: 0.22 },
  ],
  // One soft pop.
  create: [{ frequency: 740, start: 0, duration: 0.09, type: "triangle" }],
  // Two gentle notes, falling.
  notify: [
    { frequency: 880, start: 0, duration: 0.14, type: "triangle" },
    { frequency: 659.25, start: 0.12, duration: 0.2, type: "triangle" },
  ],
  // Low, short, slightly buzzy.
  error: [{ frequency: 196, start: 0, duration: 0.18, type: "square", gain: 0.25 }],
};

const VOLUME = 0.08;
let context: AudioContext | null = null;

export function playSound(name: SoundName) {
  if (typeof window === "undefined" || preference.get() === "off") return;
  try {
    context ??= new AudioContext();
    // Browsers start the context suspended until a user gesture; every sound
    // here follows one (a click, a drop), except notifications, which then
    // simply stay silent until the person has interacted with the page.
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime + 0.01;
    for (const note of SOUNDS[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type ?? "sine";
      oscillator.frequency.value = note.frequency;
      const peak = VOLUME * (note.gain ?? 1);
      const start = now + note.start;
      // Quick attack, exponential release: no clicks at either end.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + note.duration + 0.02);
    }
  } catch {
    // No Web Audio (old browser, blocked): sounds are optional.
  }
}
