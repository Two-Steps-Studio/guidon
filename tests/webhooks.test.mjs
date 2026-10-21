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
  guardedRequest,
  isPrivateAddress,
  parseWebhookUrl,
  signWebhookPayload,
} from "../src/lib/webhooks/security.ts";
import { isWebhookEventType } from "../src/lib/webhooks/events.ts";
import { describeReceiverError, detectWebhookFormat, formatWebhookBody } from "../src/lib/webhooks/formats.ts";
import { DIRECTORY_CONTENT_TYPE, directoryResponse, jwkThumbprint, parseSigningKey, signRequest } from "../src/lib/web-bot-auth.ts";
import { createPublicKey, verify } from "node:crypto";

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

console.log("\n  formats (Discord / Slack / Guidon envelope)");
check("discord.com webhook -> discord", detectWebhookFormat("https://discord.com/api/webhooks/1/abc") === "discord");
check("discordapp.com / ptb -> discord", detectWebhookFormat("https://discordapp.com/api/webhooks/1/a") === "discord" && detectWebhookFormat("https://ptb.discord.com/api/webhooks/1/a") === "discord");
check("discord.com, not a webhook path -> guidon", detectWebhookFormat("https://discord.com/channels/1/2") === "guidon");
check("look-alike host -> guidon", detectWebhookFormat("https://discord.com.evil.test/api/webhooks/1/a") === "guidon");
check("slack incoming webhook -> slack", detectWebhookFormat("https://hooks.slack.com/services/T/B/x") === "slack");
check("anything else -> guidon", detectWebhookFormat("https://example.com/hook") === "guidon");

const envelope = {
  id: "d1", type: "task.status_changed", created_at: "2026-09-30T00:00:00.000Z",
  project: { id: "p", name: "Space Game" },
  data: { task: { id: "t", title: "Fix <door> & collision", status: "review", url: "https://useguidon.com/projects/p/work" } },
};
check("guidon format = envelope unchanged", formatWebhookBody("guidon", envelope) === envelope);
const discord = formatWebhookBody("discord", envelope);
check("discord: one embed with title, url and project footer",
  discord.embeds.length === 1 && discord.embeds[0].title === envelope.data.task.title && discord.embeds[0].url === envelope.data.task.url && discord.embeds[0].footer.text === "Space Game",
  JSON.stringify(discord));
check("discord: status in headline", discord.embeds[0].author.name === "Task moved to Review", discord.embeds[0].author.name);
check("discord: no @mentions from task titles", Array.isArray(discord.allowed_mentions.parse) && discord.allowed_mentions.parse.length === 0);
const done = formatWebhookBody("discord", { ...envelope, type: "task.completed", data: { task: { ...envelope.data.task, status: "done" } } });
check("discord: completed headline", done.embeds[0].author.name === "Task completed");
const longTitle = formatWebhookBody("discord", { ...envelope, data: { task: { ...envelope.data.task, title: "x".repeat(400) } } });
check("discord: title clipped to 256", longTitle.embeds[0].title.length === 256, longTitle.embeds[0].title.length);
const ping = formatWebhookBody("discord", { type: "ping", data: { webhook_id: "w" } });
check("discord: ping is a non-empty message", ping.embeds[0].title === "Guidon webhook connected");
const slack = formatWebhookBody("slack", envelope);
check("slack: text with escaped link label", slack.text === "Task moved to Review in Space Game: <https://useguidon.com/projects/p/work|Fix &lt;door&gt; &amp; collision>", slack.text);
check("slack: ping has text", typeof formatWebhookBody("slack", { type: "ping" }).text === "string");

check("receiver error: Discord JSON message", describeReceiverError(400, '{"message": "Cannot send an empty message", "code": 50006}') === "Receiver responded with HTTP 400: Cannot send an empty message");
check("receiver error: plain text first line", describeReceiverError(400, "no_text\nmore") === "Receiver responded with HTTP 400: no_text");
check("receiver error: empty body", describeReceiverError(502, "") === "Receiver responded with HTTP 502.");

console.log("\n  guardedRequest: the address is checked again when connecting (DNS rebinding)");
{
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(req.url === "/redirect" ? 302 : 200, { "Content-Type": "text/plain", Location: "http://example.com/" });
      res.end(`${req.method} ${body}`.padEnd(5000, "x"));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = { headers: {}, timeoutMs: 3000, maxBytes: 100 };
  let blocked = null;
  try {
    await guardedRequest(new URL(`http://localhost:${port}/`), { ...base, method: "GET", allowPrivate: false });
  } catch (error) {
    blocked = error.code;
  }
  check("a name that resolves to loopback is refused at connect time", blocked === "EBLOCKED", blocked);
  const ok = await guardedRequest(new URL(`http://localhost:${port}/`), { ...base, method: "POST", body: "hi", allowPrivate: true });
  check("self-hosted (private allowed): request goes through with the body", ok.status === 200 && ok.text.startsWith("POST hi"), ok.text.slice(0, 20));
  check("response cut at maxBytes", ok.text.length === 100, ok.text.length);
  const redirect = await guardedRequest(new URL(`http://localhost:${port}/redirect`), { ...base, method: "GET", allowPrivate: true });
  check("redirects are not followed", redirect.status === 302);
  server.close();
}

console.log("\n  Web Bot Auth (src/lib/web-bot-auth.ts)");
{
  // Test key and vector from draft-meunier-http-message-signatures-directory / web-bot-auth (RFC 9421 B.1.4 key).
  const jwk = { kty: "OKP", crv: "Ed25519", d: "n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU", x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs" };
  const key = parseSigningKey(JSON.stringify({ ...jwk, nbf: 1712793600, exp: 1715385600 }));
  check("thumbprint: RFC 8037 A.3 vector", jwkThumbprint({ kty: "OKP", crv: "Ed25519", x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" }) === "kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k");
  check("published key: no private part, kid + nbf + exp", key && !("d" in key.publicJwk) && key.publicJwk.kid === jwkThumbprint(jwk) && key.publicJwk.nbf === 1712793600 && key.publicJwk.exp === 1715385600);
  const headers = signRequest({
    url: "https://example.com/",
    key,
    agentOrigin: "https://signature-agent.test",
    label: "agent2",
    now: 1735689600,
    ttlSeconds: 4889289600 - 1735689600,
    nonce: "n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==",
  });
  check("request signature matches the draft's test vector", headers.Signature.includes("RdNFx5Bj6au3YgAMQL/RzmUlZE8QZLIaXGRpw985hWnwPfMxT228NMk6ehRS1PSl4e8PhbNZACSanGdhEwYCCg=="), headers.Signature);
  check("Signature-Agent is a dictionary member", headers["Signature-Agent"] === 'agent2="https://signature-agent.test"');
  check("not a JWK / not Ed25519 / empty -> no key", parseSigningKey("nope") === null && parseSigningKey(JSON.stringify({ kty: "EC" })) === null && parseSigningKey("") === null);
  const defaults = parseSigningKey(JSON.stringify(jwk), new Date("2026-05-01T00:00:00Z"));
  check("no nbf/exp -> start of this year to end of next", defaults.publicJwk.nbf === Date.UTC(2026, 0, 1) / 1000 && defaults.publicJwk.exp === Date.UTC(2028, 0, 1) / 1000);
  const dir = directoryResponse({ authority: "useguidon.com", keys: [key], now: 1735689600 });
  check("directory: media type and keys[]", dir.headers["Content-Type"] === DIRECTORY_CONTENT_TYPE && JSON.parse(dir.body).keys.length === 1);
  const params = dir.headers["Signature-Input"].replace(/^binding=/, "");
  const base = `"@authority";req: useguidon.com\n"content-digest": ${dir.headers["Content-Digest"]}\n"@signature-params": ${params}`;
  const signature = Buffer.from(dir.headers.Signature.match(/:(.*):/)[1], "base64");
  check("directory signature verifies with the listed key", verify(null, Buffer.from(base), createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" }), signature));
  check("directory signature has the directory tag", params.includes('tag="http-message-signatures-directory"'));
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
