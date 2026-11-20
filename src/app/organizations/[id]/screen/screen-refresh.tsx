"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

/** How often the wall screen pulls fresh numbers. */
const REFRESH_MS = 60_000;

/**
 * Keeps an unattended screen current: re-renders the server page every
 * minute, keeps the display awake where the browser allows it (Wake Lock),
 * and shows a clock - nothing to click.
 */
export function ScreenRefresh({ updatedAt, locale, updatedLabel }: { updatedAt: number; locale: string; updatedLabel: string }) {
  const router = useRouter();
  const [now, setNow] = useState(updatedAt);

  useEffect(() => {
    const refresh = window.setInterval(() => router.refresh(), REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [router]);

  useEffect(() => {
    type WakeLockSentinel = { release: () => Promise<void> };
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState === "visible") void wakeLock.request("screen").then((lock) => (sentinel = lock)).catch(() => undefined);
    };
    request();
    // The browser drops the lock when the tab is hidden; take it again on return.
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  // Times are formatted in the screen's own time zone, so only once mounted (the server's would differ).
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const time = (value: number) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(value);
  if (!mounted) return <div className="min-h-16" />;
  return (
    <div className="text-right tabular-nums">
      <p className="text-4xl font-semibold">{time(now)}</p>
      {/* updatedLabel is a translated "Updated {time}" template, filled here in the screen's own time zone. */}
      <p className="text-sm text-muted-foreground">{updatedLabel.replace("{time}", time(updatedAt))}</p>
    </div>
  );
}

const noSubscribe = () => () => {};
