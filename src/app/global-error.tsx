"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort boundary for errors in the root layout itself, where
 * src/app/error.tsx can't render (no providers, no translations - it has to
 * bring its own <html>). Reports to Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, padding: 24 }}>
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#555" }}>Guidon couldn&apos;t load this page. Try again in a moment.{error.digest ? ` (ref ${error.digest})` : ""}</p>
          <button type="button" onClick={reset} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
