import assert from "node:assert/strict";
import vm from "node:vm";

const { parseUiTree, sandboxChangeSchema, applySandboxChange, SANDBOX_LIMITS, WORKER_PRELUDE, WORKER_EPILOGUE, SANDBOX_FRAME_HTML } = await import("../src/lib/work/module-sandbox.ts");
const { moduleManifestSchema } = await import("../src/lib/work/module-manifest.ts");
const { unsupportedModulePermissions } = await import("../src/lib/work/module-records.ts");
const { reviewModuleSubmission } = await import("../src/lib/work/module-review.ts");
const { MODULE_SCRIPT_TEMPLATE } = await import("../src/lib/work/module-sdk.ts");
let passed = 0;
function test(name, run) { run(); passed++; console.log(`pass ${name}`); }

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = {
  manifestVersion: 1, id: "scripted", name: "Scripted", version: "1.0.0", author: { name: "QA" }, engine: { minVersion: "1.3.0" },
  permissions: ["module-data:read", "module-data:write", "code:run"],
  entities: [{ id: "note", name: "Note", fields: [{ id: "text", name: "Text", type: "text", required: true }] }],
  views: [{ id: "main", name: "Main", type: "custom" }],
  script: { source: MODULE_SCRIPT_TEMPLATE },
};

/** Runs prelude + source + epilogue the way the worker does, with a fake worker global. */
function runWorker(source) {
  const posted = [];
  const context = vm.createContext({ postMessage: (message) => posted.push(message), fetch: () => "network", XMLHttpRequest: function () {}, WebSocket: function () {}, importScripts: () => {}, indexedDB: {}, navigator: {} });
  context.self = context;
  vm.runInContext(WORKER_PRELUDE + source + WORKER_EPILOGUE, context, { timeout: 1000 });
  // Structured clone in a real worker; JSON here also drops the vm realm's prototypes.
  const send = (message) => { context.onmessage({ data: structuredClone(message) }); return JSON.parse(JSON.stringify(posted.at(-1))); };
  return { posted, send, context };
}
const ask = { records: [{ id: uuid(1), entity: "note", values: { text: "A" } }], entities: base.entities, form: { note: "B" }, canWrite: true };

test("UI trees: valid ones pass, unknown nodes/props, bad names and limits fail", () => {
  const tree = { type: "stack", children: [{ type: "heading", text: "Hi" }, { type: "button", label: "Go", action: "go", payload: 1 }, { type: "table", columns: ["a"], rows: [["1"]] }] };
  assert.deepEqual(parseUiTree(tree), tree);
  for (const bad of [
    { type: "html", text: "<b>x</b>" },
    { type: "text", text: "x", onClick: "alert(1)" },
    { type: "text", text: "x".repeat(SANDBOX_LIMITS.text + 1) },
    { type: "button", label: "x", action: "javascript:alert(1)" },
    { type: "progress", value: 1, max: 0 },
    { type: "table", columns: Array(SANDBOX_LIMITS.tableColumns + 1).fill("c"), rows: [] },
    null, "text",
  ]) assert.throws(() => parseUiTree(bad), JSON.stringify(bad)?.slice(0, 60));
  let deep = { type: "text", text: "leaf" };
  for (let i = 0; i < SANDBOX_LIMITS.depth; i++) deep = { type: "stack", children: [deep] };
  assert.throws(() => parseUiTree(deep), /nested deeper/);
  const wide = { type: "stack", children: Array.from({ length: 10 }, () => ({ type: "list", children: Array(100).fill({ type: "badge", text: "b" }) })) };
  assert.throws(() => parseUiTree(wide), /more than/);
});

test("changes: strict shape, bounded, applied by id", () => {
  assert.equal(sandboxChangeSchema.safeParse({ upsert: [{ entity: "note", values: { text: "x" } }] }).success, true);
  assert.equal(sandboxChangeSchema.safeParse({ upsert: [{ entity: "note", values: { text: { nested: true } } }] }).success, false, "values are scalars");
  assert.equal(sandboxChangeSchema.safeParse({ remove: ["not-a-uuid"] }).success, false);
  assert.equal(sandboxChangeSchema.safeParse({ upsert: [], sql: "DROP TABLE" }).success, false, "no extra keys");
  assert.equal(sandboxChangeSchema.safeParse({ remove: Array(SANDBOX_LIMITS.changes + 1).fill(uuid(1)) }).success, false);
  const records = [{ id: uuid(1), entity: "note", values: { text: "A" } }, { id: uuid(2), entity: "note", values: { text: "B" } }];
  const next = applySandboxChange(records, { upsert: [{ id: uuid(2), entity: "note", values: { text: "B2" } }, { entity: "note", values: { text: "C" } }, { id: uuid(9), entity: "note", values: { text: "D" } }], remove: [uuid(1)] }, () => uuid(5));
  assert.deepEqual(next.map((record) => [record.id, record.values.text]), [[uuid(2), "B2"], [uuid(5), "C"], [uuid(9), "D"]]);
  assert.equal(records[0].values.text, "A", "input untouched");
});

test("manifest: scripts need code:run and engine 1.3, custom views need a script; the runtime supports code:run", () => {
  const manifest = moduleManifestSchema.parse(base);
  assert.equal(unsupportedModulePermissions(manifest).length, 0);
  assert.equal(moduleManifestSchema.safeParse({ ...base, permissions: ["module-data:read", "module-data:write"] }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...base, engine: { minVersion: "1.2.0" } }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...base, script: undefined }).success, false, "custom view without a script");
  assert.equal(moduleManifestSchema.safeParse({ ...base, script: { source: "" } }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...base, script: { source: "x".repeat(100_001) } }).success, false);
});

test("review: a script is a warning a reviewer has to read, not a blocker", () => {
  const review = reviewModuleSubmission(base, { description: "Notes.", changelog: "" });
  assert.deepEqual(review.blocking, []);
  assert.ok(review.warnings.some((finding) => finding.code === "script"));
});

test("worker prelude: network and storage entry points are gone, globals are hidden from the script", () => {
  const { send, posted } = runWorker(`guidon.module({ render() { return { type: "text", text: [typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts, typeof indexedDB, typeof navigator, typeof self, typeof globalThis, typeof postMessage].join(",") }; } });`);
  assert.equal(posted[0].type, "ready");
  const answer = send({ type: "render", id: 1, ...ask });
  assert.equal(answer.tree.text, "undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined");
});

test("worker prelude: the template renders, actions return changes, errors and logs are reported", () => {
  const template = runWorker(MODULE_SCRIPT_TEMPLATE);
  assert.equal(template.posted[0].type, "ready");
  assert.doesNotThrow(() => parseUiTree(template.send({ type: "render", id: 1, ...ask }).tree), "the template draws a valid tree");

  const { send, posted } = runWorker(`console.log("loaded", { a: 1 });
guidon.module({ render: (ctx) => ({ type: "text", text: String(ctx.records.length) }), onAction(action, payload, ctx) {
  if (action === "boom") throw new Error("nope");
  return { upsert: [{ entity: "note", values: { text: ctx.form.note } }] };
} });`);
  assert.deepEqual(posted.slice(0, 2).map((message) => message.type), ["log", "ready"]);
  assert.equal(posted[0].text, `loaded {"a":1}`);
  assert.deepEqual(send({ type: "action", id: 2, action: "add", payload: null, ...ask }), { type: "result", id: 2, change: { upsert: [{ entity: "note", values: { text: "B" } }] } });
  assert.deepEqual(send({ type: "action", id: 3, action: "boom", payload: null, ...ask }), { type: "error", id: 3, message: "nope" });
  assert.deepEqual(send({ type: "render", id: 4, ...ask }), { type: "result", id: 4, tree: { type: "text", text: "1" } });
});

test("worker prelude: a script that never registers, or registers twice, is reported", () => {
  assert.equal(runWorker(`const x = 1;`).posted.at(-1).type, "error");
  assert.throws(() => runWorker(`guidon.module({ render() {} }); guidon.module({ render() {} });`), /called once/);
});

test("frame: CSP allows no connections, the frame relays only to its parent", () => {
  assert.match(SANDBOX_FRAME_HTML, /connect-src 'none'/);
  assert.match(SANDBOX_FRAME_HTML, /default-src 'none'/);
  assert.match(SANDBOX_FRAME_HTML, /event\.source !== window\.parent/);
});

console.log(`${passed} module sandbox tests passed`);
