import * as Sentry from "@sentry/nextjs";

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
