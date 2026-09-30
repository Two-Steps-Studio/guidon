// Only node: built-ins, so tests/webhooks.test.mjs can load this file with
// Node's type stripping (same arrangement as src/lib/github/task-refs.ts).
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export const WEBHOOK_URL_MAX_LENGTH = 2048;

/** 32 random bytes, prefixed so a leaked value is recognisable in logs and secret scanners. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/**
 * `sha256=<hex>` over `<timestamp>.<body>`. Signing the timestamp with the
 * body lets a receiver reject replays of an old delivery - see
 * docs/webhooks.md for the verification side.
 */
export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

// Loopback, private, link-local (incl. cloud metadata at 169.254.169.254),
// carrier-grade NAT, "this network", multicast and reserved ranges.
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return BLOCKED.check(mapped[1], "ipv4");
    return BLOCKED.check(address, "ipv6");
  }
  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Shape-only checks, no network. `allowPrivate` is for self-hosted installs, where internal targets are the point. */
export function parseWebhookUrl(raw: string, { allowPrivate }: { allowPrivate: boolean }): UrlCheck {
  if (raw.length > WEBHOOK_URL_MAX_LENGTH) return { ok: false, reason: "URL is too long." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Enter a valid URL." };
  }
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    return { ok: false, reason: allowPrivate ? "Use an http:// or https:// URL." : "Use an https:// URL." };
  }
  if (url.username || url.password) return { ok: false, reason: "Don't put credentials in the URL." };
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
      return { ok: false, reason: "That address isn't reachable from Guidon Cloud." };
    }
    if (isIP(host) && isPrivateAddress(host)) {
      return { ok: false, reason: "That address isn't reachable from Guidon Cloud." };
    }
  }
  return { ok: true, url };
}

/**
 * parseWebhookUrl plus a DNS lookup, so a public-looking hostname that
 * resolves to a private address is refused too. Run again right before each
 * delivery, since DNS can change after the webhook was saved.
 */
export async function checkWebhookUrl(raw: string, { allowPrivate }: { allowPrivate: boolean }): Promise<UrlCheck> {
  const parsed = parseWebhookUrl(raw, { allowPrivate });
  if (!parsed.ok || allowPrivate) return parsed;

  const host = parsed.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return parsed;
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      return { ok: false, reason: "That address isn't reachable from Guidon Cloud." };
    }
  } catch {
    return { ok: false, reason: "That host name doesn't resolve." };
  }
  return parsed;
}
