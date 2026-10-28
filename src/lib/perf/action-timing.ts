"use client";

export type TimedAction = "task.save" | "task.create" | "task.move" | "task.delete";

// scratch bisect: the same timing without importing @sentry/nextjs.
export async function timeAction<T>(name: TimedAction, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } finally {
    try { performance.measure(`guidon:${name}`, { start, end: performance.now() }); } catch {}
  }
}
