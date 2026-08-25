import "server-only";

import { randomBytes, createHash } from "node:crypto";

const KEY_PREFIX = "guidon_";
const PREFIX_DISPLAY_LENGTH = 12;

/** Full key, shown to the user exactly once. Never persisted in plaintext. */
export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Stored alongside the hash so the UI can show "guidon_ab12..." without ever storing the full key. */
export function keyPrefix(rawKey: string): string {
  return rawKey.slice(0, PREFIX_DISPLAY_LENGTH);
}

export function isValidApiKeyFormat(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length + 20;
}

// Scopes moved to ./scopes.ts (client-safe - no "server-only" import) and
// re-exported here so existing server-side imports of API_KEY_SCOPES from
// this file keep working unchanged.
export { API_KEY_SCOPES, type ApiKeyScope } from "./scopes";
