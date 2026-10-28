"use client";

import * as Sentry from "@sentry/nextjs";

export type TimedAction = "task.save" | "task.create" | "task.move" | "task.delete";

/**
 * Times a key board action from the click to the server's answer, under one
 * name in two places: a Sentry span in production (sampled with the rest of
 * tracing; a no-op without NEXT_PUBLIC_SENTRY_DSN) and a `guidon:<name>`
 * performance entry, which tests/perf/large-project.mjs reads back. So CI
 * budgets and production p95 measure the same thing. Only the name and
 * duration are recorded, never task content.
 */
export async function timeAction<T>(name: TimedAction, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await Sentry.startSpan({ name, op: "ui.action" }, run);
  } finally {
    try {
      performance.measure(`guidon:${name}`, { start, end: performance.now() });
    } catch {
      // Older browsers without measure options: the Sentry span still has it.
    }
  }
}
