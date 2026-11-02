import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

/**
 * Browser-side counterpart of src/instrumentation.ts. NEXT_PUBLIC_SENTRY_DSN
 * (not SENTRY_DSN) because this file ships in the client bundle - same
 * public/build-time-embedded pattern as NEXT_PUBLIC_SUPABASE_URL. A Sentry
 * DSN is meant to be public (it can only submit events, not read them), the
 * same way an anon key is.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

const posthogProjectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

// Optional, like Sentry above: unset disables it.
if (posthogProjectToken && posthogHost) {
  posthog.init(posthogProjectToken, {
    api_host: posthogHost,
    defaults: "2025-05-24",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}
