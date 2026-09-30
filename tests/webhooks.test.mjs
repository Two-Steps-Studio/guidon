#!/usr/bin/env node
/**
 * Organization webhooks (src/lib/webhooks/security.ts): URL rules, the
 * private-address block list and the payload signature.
 *
 *   npm run test:webhooks
 *
 * security.ts imports only node: built-ins on purpose, so Node's built-in
 * TypeScript type stripping can load it directly.
 */

import { createHmac } from "node:crypto";
import {
  checkWebhookUrl,
  generateWebhookSecret,
  isPrivateAddress,
  parseWebhookUrl,
  signWebhookPayload,
} from "../src/lib/webhooks/security.ts";
import { isWebhookEventType } from "../src/lib/webhooks/events.ts";

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

console.log("\n  isPrivateAddress");
for (const address of [
  "127.0.0.1",
  "10.1.2.3",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "169.254.169.254",
  "100.64.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "fd00::1",
  "fe80::1",
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.1",
  "not-an-ip",
]) {
  check(`${address} blocked`, isPrivateAddress(address));
}
for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
  check(`${address} allowed`, !isPrivateAddress(address));
}

console.log("\n  parseWebhookUrl (Guidon Cloud)");
const cloud = { allowPrivate: false };
check("https ok", parseWebhookUrl("https://example.com/hook", cloud).ok);
check("http refused", !parseWebhookUrl("http://example.com/hook", cloud).ok);
check("ftp refused", !parseWebhookUrl("ftp://example.com/hook", cloud).ok);
check("garbage refused", !parseWebhookUrl("not a url", cloud).ok);
check("credentials refused", !parseWebhookUrl("https://user:pw@example.com/", cloud).ok);
check("localhost refused", !parseWebhookUrl("https://localhost/hook", cloud).ok);
check("*.localhost refused", !parseWebhookUrl("https://app.localhost/hook", cloud).ok);
check("*.internal refused", !parseWebhookUrl("https://metadata.google.internal/", cloud).ok);
check("private IPv4 literal refused", !parseWebhookUrl("https://192.168.0.10/hook", cloud).ok);
check("metadata IP refused", !parseWebhookUrl("https://169.254.169.254/latest", cloud).ok);
check("IPv6 loopback literal refused", !parseWebhookUrl("https://[::1]/hook", cloud).ok);
check("too long refused", !parseWebhookUrl(`https://example.com/${"a".repeat(2100)}`, cloud).ok);

console.log("\n  parseWebhookUrl (self-hosted)");
const selfHosted = { allowPrivate: true };
check("http ok", parseWebhookUrl("http://jenkins.lan:8080/hook", selfHosted).ok);
check("private IP ok", parseWebhookUrl("http://10.0.0.5/hook", selfHosted).ok);
check("ftp still refused", !parseWebhookUrl("ftp://10.0.0.5/", selfHosted).ok);

console.log("\n  checkWebhookUrl (DNS)");
{
  const result = await checkWebhookUrl("https://localhost.localdomain.invalid/", cloud);
  check("unresolvable host refused", !result.ok);
}
{
  const result = await checkWebhookUrl("https://127.0.0.1.nip.io/hook", cloud);
  // Resolves to 127.0.0.1 when DNS is available; refused either way.
  check("host resolving to loopback refused", !result.ok, JSON.stringify(result));
}

console.log("\n  events / secrets / signature");
check("known event", isWebhookEventType("task.created"));
check("unknown event", !isWebhookEventType("task.exploded"));
const secret = generateWebhookSecret();
check("secret prefix and length", secret.startsWith("whsec_") && secret.length > 40, secret);
check("secrets differ", generateWebhookSecret() !== secret);
const body = JSON.stringify({ type: "ping" });
const signature = signWebhookPayload(secret, 1790000000, body);
const expected = `sha256=${createHmac("sha256", secret).update(`1790000000.${body}`).digest("hex")}`;
check("signature matches the documented scheme", signature === expected, signature);
check("timestamp is signed", signWebhookPayload(secret, 1790000001, body) !== signature);

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
