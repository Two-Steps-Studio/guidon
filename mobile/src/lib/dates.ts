import { currentLocaleTag } from "@/i18n";

/**
 * tasks.due_date is a timestamptz with calendar-day meaning: the web app
 * always writes UTC midnight of the picked day (src/lib/date.ts in the main
 * repo). Read it by its UTC parts and compare it with the viewer's local
 * "today", or the day shifts for anyone not in UTC.
 */

function utcParts(iso: string): { y: number; m: number; d: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

/** Whole days from local today to the due day (negative = overdue). */
export function daysUntilDue(iso: string, now = new Date()): number | null {
  const parts = utcParts(iso);
  if (!parts) return null;
  const due = Date.UTC(parts.y, parts.m, parts.d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86_400_000);
}

export type DueState = "none" | "overdue" | "soon" | "upcoming";

export function dueState(iso: string | null, done: boolean): DueState {
  if (!iso || done) return "none";
  const days = daysUntilDue(iso);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days <= 1) return "soon";
  return "upcoming";
}

/** "Oct 20" (or "Oct 20, 2027" outside the current year), in the system locale. */
export function formatDueDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleDateString(currentLocaleTag(), {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: date.getUTCFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** The calendar day a due date represents, as a local Date (for the date picker). */
export function dueDateToLocal(iso: string | null): Date {
  const parts = iso ? utcParts(iso) : null;
  if (!parts) return new Date();
  return new Date(parts.y, parts.m, parts.d);
}

/** A picked local day -> "YYYY-MM-DD", which the API stores as UTC midnight of that day. */
export function localDayToApi(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The ISO value the server will hand back for a "YYYY-MM-DD" (for optimistic cache writes). */
export function apiDayToIso(day: string): string {
  return new Date(day).toISOString();
}

export function formatTime(ms: number): string {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date().toDateString();
  try {
    return sameDay
      ? date.toLocaleTimeString(currentLocaleTag(), { hour: "numeric", minute: "2-digit" })
      : date.toLocaleString(currentLocaleTag(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return date.toISOString();
  }
}

export function formatDateTime(iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? "" : formatTime(ms);
}
