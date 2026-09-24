import * as Sentry from "@sentry/nextjs";

/**
 * Optional production error tracking - same "unset env var = fully inert"
 * philosophy as AI_PROVIDER (src/lib/ai/provider.ts) and STORAGE_PROVIDER: a
 * self-hosted instance that never sets SENTRY_DSN sends nothing anywhere,
 * and Sentry.init() is never even called. See docs/configuration.md.
 */
export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
