import "server-only";

import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();

if (!projectToken && process.env.NODE_ENV === "development") {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured"
  );
}
if (!host && process.env.NODE_ENV === "development") {
  throw new Error(
    "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured"
  );
}

const loggerProvider = projectToken && host
  ? new LoggerProvider({
      resource: resourceFromAttributes({ "service.name": "guidon" }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: new URL("i/v1/logs", `${host.replace(/\/$/, "")}/`).toString(),
            headers: {
              Authorization: `Bearer ${projectToken}`,
              "Content-Type": "application/json",
            },
          }),
        }),
      ],
    })
  : null;

// This provider is intentionally not global: only the purpose-written log
// lines below are exported, never the application's existing loggers.
const logger = loggerProvider?.getLogger("guidon.posthog-logs");

export function emitPostHogLog(
  body: string,
  severityNumber: SeverityNumber,
  attributes: Record<string, string | number | boolean>
) {
  logger?.emit({ body, severityNumber, attributes });
}

export async function flushPostHogLogs() {
  try {
    await loggerProvider?.forceFlush();
  } catch {
    // Observability must not delay or fail an application response.
  }
}
