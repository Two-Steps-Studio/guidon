"use client";

import { useSyncExternalStore } from "react";

/**
 * A per-device setting kept in localStorage (this screen, these speakers -
 * not the account), readable with a hook that follows changes in this tab
 * and in others. Falls back to the default when storage is blocked.
 */
export function createDevicePreference<T extends string>(key: string, options: readonly T[], fallback: T) {
  const changeEvent = `guidon:pref:${key}`;

  function get(): T {
    try {
      const value = window.localStorage.getItem(key);
      return (options as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
    } catch {
      return fallback;
    }
  }

  function subscribe(onChange: () => void) {
    // "storage" covers other tabs, the custom event this one.
    window.addEventListener("storage", onChange);
    window.addEventListener(changeEvent, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(changeEvent, onChange);
    };
  }

  function set(value: T) {
    try {
      if (value === fallback) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // Storage blocked (private mode): the choice lasts until reload.
    }
    window.dispatchEvent(new Event(changeEvent));
  }

  function usePreference(): T {
    return useSyncExternalStore(subscribe, get, () => fallback);
  }

  return { get, set, usePreference };
}
