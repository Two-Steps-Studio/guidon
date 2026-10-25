import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import dns from "node:dns";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as security from "../src/lib/webhooks/security.ts";
import * as formats from "../src/lib/webhooks/formats.ts";

// Execute the real dispatcher with only its framework, database and signing-key
// environment replaced. HTTP, signatures and formatting use production code.
const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/lib/webhooks/dispatch.ts", import.meta.url), "utf8");
function loadDispatcher(overrides = {}) {
  const dependencies = {
    "server-only": {},
    "node:crypto": require("node:crypto"),
    "next/server": { after() { throw new Error("Unexpected background work in delivery test"); } },
    "@/lib/db/pool": { hasDirectDatabase: () => true },
    "@/lib/site-url": { SITE_URL: "https://guidon.test" },
    "@/lib/data/organization-webhooks": {},
    "./security": security,
    "./formats": formats,
    "@/lib/web-bot-auth": { signingKeyFromEnv: () => null },
    ...overrides,
  };
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, {
    exports, URL, Date, Error, console,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
      return dependencies[name];
    },
  }, { filename: "dispatch.ts" });
  return exports;
}

async function withReceiver(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`, server);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
const options = { method: "GET", headers: {}, timeoutMs: 1000, maxBytes: 2000, allowPrivate: true };

await test("dispatcher signs the exact POST body; errors are single attempts, including 429/5xx", async () => {
  const requests = [];
  await withReceiver((req, res) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      requests.push({ headers: req.headers, body: Buffer.concat(chunks).toString(), method: req.method });
      res.writeHead(Number(req.url.slice(1)), { "Content-Type": "application/json" });
      res.end('{"message":"receiver error"}');
    });
  }, async base => {
    const { deliverWebhook } = loadDispatcher();
    for (const status of [200, 204, 400, 429, 500, 503]) {
      const before = requests.length;
      const outcome = await deliverWebhook({ id: "w", url: `${base}/${status}`, secret: "test-secret" }, "ping", { data: { webhook_id: "w" } });
      assert.equal(outcome.status, status);
      assert.equal(requests.length, before + 1);
      assert.equal(outcome.error === null, status < 300);
      if (status >= 400) assert.match(outcome.error, new RegExp(`HTTP ${status}: receiver error`));
      const sent = requests.at(-1);
      const envelope = JSON.parse(sent.body);
      assert.equal(sent.method, "POST");
      assert.equal(sent.headers["x-guidon-delivery"], envelope.id);
      assert.equal(sent.headers["x-guidon-event"], envelope.type);
      assert.equal(sent.headers["x-guidon-signature"], security.signWebhookPayload("test-secret", Number(sent.headers["x-guidon-timestamp"]), sent.body));
      assert.equal(Number(sent.headers["content-length"]), Buffer.byteLength(sent.body));
    }
  });
});

await test("guarded request has a total deadline even when the receiver keeps sending bytes", async () => {
  await withReceiver((_req, res) => {
    res.writeHead(200);
    res.write("start");
    const timer = setInterval(() => res.write("."), 20);
    const end = setTimeout(() => res.end("end"), 400);
    res.on("close", () => { clearInterval(timer); clearTimeout(end); });
  }, async base => {
    await assert.rejects(security.guardedRequest(new URL(base), { ...options, timeoutMs: 100 }), { name: "TimeoutError" });
  });
});

await test("deadline also rejects a receiver that never sends headers", async () => {
  await withReceiver(() => {}, async base => {
    await assert.rejects(security.guardedRequest(new URL(base), { ...options, timeoutMs: 100 }), { name: "TimeoutError" });
  });
});

await test("dispatcher reports timeout, connection failure and blocked URLs without leaking exception details", async () => {
  for (const [error, message] of [
    [Object.assign(new Error("secret connection details"), { name: "TimeoutError" }), /No response within 5s/],
    [Object.assign(new Error("secret connection details"), { code: "ECONNRESET" }), /Could not connect/],
    [Object.assign(new Error("secret connection details"), { code: "EBLOCKED" }), /isn't reachable/],
  ]) {
    const { deliverWebhook } = loadDispatcher({ "./security": {
      ...security,
      guardedRequest: async () => { throw error; },
    } });
    const outcome = await deliverWebhook({ id: "w", url: "http://127.0.0.1:1", secret: "test-secret" }, "ping", {});
    assert.equal(outcome.status, null);
    assert.match(outcome.error, message);
    assert.doesNotMatch(outcome.error, /secret/);
  }
  const blocked = loadDispatcher({ "@/lib/db/pool": { hasDirectDatabase: () => false } });
  assert.equal((await blocked.deliverWebhook({ id: "w", url: "https://127.0.0.1", secret: "test-secret" }, "ping", {})).status, null);
  assert.match((await blocked.deliverWebhook({ id: "w", url: "not-a-url", secret: "test-secret" }, "ping", {})).error, /valid URL/);
});

await test("a connection closed during its declared body is not a successful response", async () => {
  await withReceiver((_req, res) => {
    res.writeHead(200, { "Content-Length": "1000" });
    res.write("partial");
    setImmediate(() => res.destroy());
  }, async base => {
    await assert.rejects(security.guardedRequest(new URL(base), options));
  });
});

await test("response cap is intentional and returns bounded data without treating it as a network failure", async () => {
  await withReceiver((_req, res) => res.end("x".repeat(10000)), async base => {
    const result = await security.guardedRequest(new URL(base), { ...options, maxBytes: 100 });
    assert.equal(result.status, 200);
    assert.equal(result.text, "x".repeat(100));
  });
});

await test("transport itself rejects a private literal in Cloud mode, before contacting it", async () => {
  let contacted = false;
  await withReceiver((_req, res) => res.end("must not be contacted"), async (base, server) => {
    server.on("connection", () => { contacted = true; });
    await assert.rejects(security.guardedRequest(new URL(base.replace("http:", "https:")), { ...options, allowPrivate: false }), { code: "EBLOCKED" });
    assert.equal(contacted, false);
  });
});

await test("socket DNS lookup rejects mixed public/private answers without opening a connection", async () => {
  const original = dns.lookup;
  dns.lookup = (_host, _options, callback) => callback(null, [
    { address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 },
  ]);
  syncBuiltinESMExports();
  try {
    await assert.rejects(security.guardedRequest(new URL("https://receiver.invalid/hook"), { ...options, allowPrivate: false }), { code: "EBLOCKED" });
  } finally {
    dns.lookup = original;
    syncBuiltinESMExports();
  }
});

await test("request deadline includes a socket DNS lookup that never completes", async () => {
  const original = dns.lookup;
  dns.lookup = () => {};
  syncBuiltinESMExports();
  try {
    await assert.rejects(security.guardedRequest(new URL("https://receiver.invalid/hook"), { ...options, timeoutMs: 100, allowPrivate: false }), { name: "TimeoutError" });
  } finally {
    dns.lookup = original;
    syncBuiltinESMExports();
  }
});

await test("redirects are returned without contacting the Location target", async () => {
  let requests = 0;
  await withReceiver((_req, res) => {
    requests++;
    res.writeHead(302, { Location: "http://unreachable.invalid/never" });
    res.end();
  }, async base => {
    const result = await loadDispatcher().deliverWebhook({ id: "w", url: base, secret: "secret" }, "ping", {});
    assert.equal(result.status, 302);
    assert.match(result.error, /Redirects are not followed/);
    assert.equal(requests, 1);
  });
});

await test("Discord and Slack send native bodies with signatures covering those exact bytes", async () => {
  for (const [url, format] of [["https://discord.com/api/webhooks/1/test", "discord"], ["https://hooks.slack.com/services/test", "slack"]]) {
    let sent;
    const { deliverWebhook } = loadDispatcher({ "./security": {
      ...security,
      checkWebhookUrl: async raw => ({ ok: true, url: new URL(raw) }),
      guardedRequest: async (_url, request) => { sent = request; return { status: 204, text: "" }; },
    } });
    const outcome = await deliverWebhook({ id: "w", url, secret: "test-secret" }, "task.created", {
      project: { id: "p", name: "A project" }, data: { task: { id: "t", title: "Task <&>", url: "https://guidon.test/task" } },
    });
    assert.equal(outcome.error, null);
    const body = JSON.parse(sent.body);
    if (format === "discord") assert.equal(body.embeds[0].title, "Task <&>");
    else assert.match(body.text, /Task &lt;&amp;&gt;/);
    assert.equal(sent.headers["X-Guidon-Signature"], security.signWebhookPayload("test-secret", Number(sent.headers["X-Guidon-Timestamp"]), sent.body));
  }
});

await test("documented Node verifier rejects stale, future, malformed and tampered deliveries", async () => {
  const docs = await readFile(new URL("../docs/webhooks.md", import.meta.url), "utf8");
  const example = docs.match(/```js\s+([\s\S]*?)```/)[1].replace(/^import .*;\s*/m, "");
  const verify = vm.runInNewContext(`${example}\nverifyGuidonWebhook`, { createHmac, timingSafeEqual, Buffer, Date });
  const body = '{"type":"ping"}';
  const secret = "test-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = value => ({ "x-guidon-timestamp": value, "x-guidon-signature": `sha256=${createHmac("sha256", secret).update(`${value}.${body}`).digest("hex")}` });
  assert.equal(verify(body, headers(timestamp), secret), true);
  assert.equal(verify(`${body} `, headers(timestamp), secret), false);
  assert.equal(verify(body, headers(timestamp), "wrong-secret"), false);
  for (const bad of [String(Number(timestamp) - 600), String(Number(timestamp) + 600), "NaN", "Infinity", "", undefined, "1e9"]) {
    assert.equal(verify(body, headers(bad), secret), false, `Rejected timestamp: ${bad}`);
  }
  assert.equal(verify(body, { "x-guidon-timestamp": timestamp, "x-guidon-signature": [] }, secret), false);
});
