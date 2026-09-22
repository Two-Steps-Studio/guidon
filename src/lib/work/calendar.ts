/**
 * Month-grid helpers for /projects/[id]/calendar. All arithmetic is done in
 * UTC on plain YYYY-MM-DD strings: tasks store `due_date` as a date the UI
 * edits with a date input (task-detail-dialog slices it to 10 characters),
 * so the calendar buckets by that same date part and never converts through
 * the viewer's or the server's timezone.
 */

import { dueDateKey } from "./task-board";

export interface CalendarDay {
  /** YYYY-MM-DD */
  iso: string;
  /** Day of month, 1-31 */
  day: number;
  inMonth: boolean;
}

export interface MonthGrid {
  year: number;
  /** 0-11 */
  month: number;
  weeks: CalendarDay[][];
  /** First visible day (inclusive), YYYY-MM-DD */
  rangeStart: string;
  /** Day after the last visible day (exclusive), YYYY-MM-DD */
  rangeEnd: string;
}

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isoFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** `?month=YYYY-MM`, falling back to the month of `today` for anything missing or out of range. */
export function parseMonthParam(value: string | undefined, today: Date): { year: number; month: number } {
  const match = value ? MONTH_PARAM.exec(value) : null;
  if (match) {
    const year = Number(match[1]);
    if (year >= 1970 && year <= 2100) return { year, month: Number(match[2]) - 1 };
  }
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

/** Monday-first weeks covering the whole month, padded with the neighbouring months' days. */
export function buildMonthGrid(year: number, month: number): MonthGrid {
  const first = Date.UTC(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = (new Date(first).getUTCDay() + 6) % 7;
  const weekCount = Math.ceil((leading + daysInMonth) / 7);
  const start = first - leading * DAY_MS;

  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = start + (w * 7 + d) * DAY_MS;
      const date = new Date(ms);
      week.push({
        iso: isoFromUtc(ms),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month,
      });
    }
    weeks.push(week);
  }

  return {
    year,
    month,
    weeks,
    rangeStart: isoFromUtc(start),
    rangeEnd: isoFromUtc(start + weekCount * 7 * DAY_MS),
  };
}

/**
 * Groups tasks by the YYYY-MM-DD part of `due_date`; tasks without one are
 * skipped. `due_date` can be a `Date` instance (self-hosted's direct `pg`
 * query) or an ISO string (Supabase/PostgREST) - see `dueDateKey`'s own
 * comment in task-board.ts for why the type alone doesn't guarantee which.
 */
export function groupTasksByDay<T extends { due_date: string | Date | null }>(tasks: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const task of tasks) {
    const key = dueDateKey(task.due_date);
    if (!key) continue;
    const list = byDay.get(key);
    if (list) list.push(task);
    else byDay.set(key, [task]);
  }
  return byDay;
}
