"use client";

import { useEffect, useState } from "react";
import { createDevicePreference } from "@/lib/device-preference";

/**
 * Profile -> Wallpaper: a picture of your own behind the app instead of the
 * animated background - kept in this browser only (IndexedDB), never
 * uploaded, so it costs the server nothing and stays private.
 *
 * IndexedDB rather than localStorage: a photo is megabytes, localStorage
 * holds ~5 MB of base64-inflated text per site. Before saving, the picture is
 * scaled down to fit 2560 px and re-encoded as WebP, so a phone photo of
 * 8 MB ends up a few hundred KB.
 */

const DB_NAME = "guidon-device";
const STORE = "kv";
const KEY = "wallpaper";
const CHANNEL = "guidon-wallpaper";
const CHANGE_EVENT = "guidon:wallpaper";
const MAX_SIDE = 2560;
export const WALLPAPER_MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** How much the page colour is laid over the picture, so text stays readable. */
export const WALLPAPER_DIM_OPTIONS = ["20", "40", "60", "80"] as const;
export type WallpaperDim = (typeof WALLPAPER_DIM_OPTIONS)[number];
const dimPreference = createDevicePreference<WallpaperDim>("guidon-wallpaper-dim", WALLPAPER_DIM_OPTIONS, "60");
export const useWallpaperDim = dimPreference.usePreference;
export const setWallpaperDim = dimPreference.set;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadWallpaper(): Promise<Blob | null> {
  try {
    const value = await withStore<unknown>("readonly", (store) => store.get(KEY));
    return value instanceof Blob ? value : null;
  } catch {
    // Storage blocked (private mode, disabled site data): no wallpaper.
    return null;
  }
}

function announce() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // Other tabs pick it up on their next load.
  }
}

export async function saveWallpaper(blob: Blob | null): Promise<void> {
  await withStore<unknown>("readwrite", (store) => (blob ? store.put(blob, KEY) : store.delete(KEY)) as IDBRequest<unknown>);
  announce();
}

/** Any image the browser can decode -> WebP that fits MAX_SIDE. */
export async function prepareWallpaper(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("not-an-image");
  if (file.size > WALLPAPER_MAX_INPUT_BYTES) throw new Error("too-large");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("not-an-image");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("not-an-image");
  return blob;
}

/** An object URL for the saved wallpaper (null when none), kept current across tabs. */
export function useWallpaperUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let current: string | null = null;
    let cancelled = false;
    const refresh = async () => {
      const blob = await loadWallpaper();
      if (cancelled) return;
      if (current) URL.revokeObjectURL(current);
      current = blob ? URL.createObjectURL(blob) : null;
      setUrl(current);
    };
    void refresh();

    window.addEventListener(CHANGE_EVENT, refresh);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = refresh;
    } catch {
      // No cross-tab updates.
    }
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_EVENT, refresh);
      channel?.close();
      if (current) URL.revokeObjectURL(current);
    };
  }, []);

  return url;
}
