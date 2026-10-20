/**
 * Recurring tasks (migration 063) - the date arithmetic and copying rules,
 * kept free of imports so tests/recurrence.test.mjs runs it with Node's
 * built-in type stripping. recurrence.ts does the database part.
 */

export const RECURRENCE_RULES = ["weekly", "monthly", "every_n_days"] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export const MAX_RECURRENCE_INTERVAL = 365;

export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  return typeof value === "string" && (RECURRENCE_RULES as readonly string[]).includes(value);
}

/**
 * A rule + interval as the database stores it, or null for "doesn't repeat".
 * Anything invalid is null too, so a bad value never half-saves.
 */
export function normalizeRecurrence(
  rule: unknown,
  interval: unknown
): { recurrence_rule: RecurrenceRule; recurrence_interval: number } | null {
  if (!isRecurrenceRule(rule)) return null;
  const n = typeof interval === "number" ? interval : Number(interval);
  if (!Number.isInteger(n) || n < 1 || n > MAX_RECURRENCE_INTERVAL) return null;
  return { recurrence_rule: rule, recurrence_interval: n };
}

/** One step of the rule from `date` (UTC calendar arithmetic). */
export function advance(date: Date, rule: RecurrenceRule, interval: number): Date {
  const next = new Date(date.getTime());
  if (rule === "monthly") {
    // 31 Jan + 1 month = 28/29 Feb, not 3 Mar: clamped to the month's last
    // day. Each step starts from the previous due date, so a task that hit
    // 28 Feb stays on the 28th afterwards.
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + interval);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
    return next;
  }
  next.setUTCDate(next.getUTCDate() + (rule === "weekly" ? 7 * interval : interval));
  return next;
}

/**
 * The next occurrence's due date. With a due date, the schedule keeps its
 * rhythm: steps from that date until it's in the future (a weekly Monday task
 * finished late on Wednesday is next due the coming Monday, not next
 * Wednesday). Without one, one step from when it was finished.
 */
export function nextDueDate(previousDue: string | null, rule: RecurrenceRule, interval: number, now: Date = new Date()): Date {
  if (!previousDue) return advance(now, rule, interval);
  let next = advance(new Date(previousDue), rule, interval);
  // Bounded: a years-old due date on "every 1 day" is ~365 steps a year.
  for (let guard = 0; next.getTime() <= now.getTime() && guard < 5000; guard++) {
    next = advance(next, rule, interval);
  }
  return next;
}

/** Checklist items in a description start unticked again in the next occurrence. */
export function resetChecklist(description: string | null): string | null {
  if (!description) return description;
  return description.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[xX]\]/gm, "$1[ ]");
}
