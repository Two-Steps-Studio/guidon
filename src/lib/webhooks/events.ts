// No imports: shared by the settings UI (a client component) and by
// security.ts / tests/webhooks.test.mjs (plain Node with type stripping).
export const WEBHOOK_EVENTS = ["task.created", "task.status_changed", "task.completed"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
