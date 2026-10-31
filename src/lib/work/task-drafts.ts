"use client";

/**
 * Unsaved task edits kept in this browser, so a crash, a discarded mobile tab
 * or a dead battery doesn't lose what someone typed. A draft belongs to one
 * user and one task (or one project's "new task" form), remembers the task
 * revision it started from - a restored draft then saves through the same
 * conflict check as a live edit, never over someone else's newer change - and
 * expires after a week. Signing out clears every draft on the device.
 */

const PREFIX = "guidon:task-draft:v1:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type TaskDraft<T> = { userId: string; revision: number; savedAt: number; form: T; clientId?: string };

export function taskDraftKey(userId: string, scope: string) {
  return `${PREFIX}${userId}:${scope}`;
}

export function readTaskDraft<T>(key: string, userId: string, now = Date.now()): TaskDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as TaskDraft<T>;
    if (draft?.userId !== userId || typeof draft.savedAt !== "number" || !draft.form || now - draft.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeTaskDraft<T>(key: string, draft: Omit<TaskDraft<T>, "savedAt">) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Storage full or blocked (private mode): the open form still has the text.
  }
}

export function clearTaskDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing stored.
  }
}

/** On sign-out: another person on this device must not get these edits. */
export function clearAllTaskDrafts() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

/** A browser UUID that also works for plain-HTTP self-hosting. */
export function newBrowserUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A stable client id so retrying task creation cannot create it twice. */
export const newTaskId = newBrowserUuid;

/**
 * A Server Action that never reached the server (offline, DNS, a dropped
 * connection) rejects with a TypeError whose text differs per browser:
 * "Failed to fetch" (Chromium), "NetworkError when attempting to fetch
 * resource." (Firefox), "Load failed" (WebKit).
 */
export function isNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}
