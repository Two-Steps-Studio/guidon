import posthog from "posthog-js";

/*
 * Optional PostHog analytics (legal-copy.ts): it is not even loaded - no
 * request, no identifier - until the person picks "Allow". The answer is kept
 * in localStorage so we ask once; withdrawing stops capture at once.
 */

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const KEY = "guidon.analytics.consent.v1";
const CHANGED = "guidon:analytics-consent";

export type AnalyticsConsent = "pending" | "granted" | "denied" | "unavailable";

export function readAnalyticsConsent(): AnalyticsConsent {
  if (!token || !host) return "unavailable";
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "granted" || stored === "denied" ? stored : "pending";
  } catch {
    return "unavailable"; // storage blocked: we couldn't remember the answer, so don't ask
  }
}

/** Starts PostHog if the person allowed it earlier (instrumentation-client.ts). */
export function startAnalyticsIfAllowed() {
  if (readAnalyticsConsent() === "granted") start();
}

/** Records the choice (`null` forgets it, so the question comes back) and applies it now. */
export function setAnalyticsConsent(choice: "granted" | "denied" | null) {
  try {
    if (choice) window.localStorage.setItem(KEY, choice);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Applied for this page anyway; the question comes back next time.
  }
  if (choice === "granted") {
    if (posthog.__loaded) posthog.opt_in_capturing();
    else start();
  } else if (posthog.__loaded) {
    posthog.opt_out_capturing();
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function subscribeAnalyticsConsent(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

function start() {
  posthog.init(token!, {
    api_host: host,
    defaults: "2025-05-24",
    capture_exceptions: true,
    // Opting out also deletes PostHog's cookie and local storage.
    opt_out_persistence_by_default: true,
    debug: process.env.NODE_ENV === "development",
  });
}
