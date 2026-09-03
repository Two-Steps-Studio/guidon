/**
 * Formatting/comparison helpers for "calendar day" fields (tasks.due_date,
 * roadmap_phases.start_date/planned_end_date) - stored as `timestamptz` but
 * semantically date-only. They're always written as UTC midnight for the
 * picked day: `new Date("YYYY-MM-DD")` parses a date-only ISO string as UTC
 * midnight per the ECMAScript date-time string spec, and that's exactly
 * what every `<input type="date">` value in this app gets wrapped in before
 * being sent to a Server Action.
 *
 * Formatting or comparing one of these values in the viewer's LOCAL
 * timezone - the default for `Date.prototype.toLocaleDateString()` and for
 * a plain `Date.now()` delta - shifts the effective calendar day for anyone
 * not in UTC: a task due "Sep 5" can display as "Sep 4" and flip to
 * "overdue" up to a full day before the picked day even arrives, for any
 * negative-UTC-offset viewer (most of the Americas). Every read of one of
 * these fields should go through here instead of a bare
 * `new Date(x).toLocaleDateString()` / `.getTime()` comparison.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the same calendar day as `ms`, in epoch milliseconds. */
function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole UTC calendar days from `fromMs` to `toMs` (positive if `toMs` is the later day). */
export function utcDaysBetween(fromMs: number, toMs: number): number {
  return Math.round((utcDayStart(toMs) - utcDayStart(fromMs)) / DAY_MS);
}

/**
 * Formats a date-only-semantics timestamp as the calendar day it
 * represents, independent of the viewer's or server's own timezone - so it
 * always reads back the same day the user picked.
 */
export function formatCalendarDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
  });
}
