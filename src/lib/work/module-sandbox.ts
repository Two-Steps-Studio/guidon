import { z } from "zod";

/**
 * The module sandbox (engine 1.3), the parts both sides share. A module's
 * script never touches the DOM or the network: it runs in a Web Worker
 * inside an <iframe sandbox="allow-scripts"> (opaque origin - no Guidon
 * cookies, storage or same-origin requests; CSP connect-src 'none') and
 * answers with a declarative UI tree, validated here and drawn by Guidon's
 * own components. Writes are a `change` the host validates and saves through
 * the same Server Action as the module's forms. See docs/module-sandbox.md.
 */

export const SANDBOX_LIMITS = { nodes: 1000, depth: 12, text: 2000, tableRows: 500, tableColumns: 20, changes: 100, logs: 200, timeoutMs: 2000 } as const;

const text = z.string().max(SANDBOX_LIMITS.text);
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const json = z.union([z.string().max(SANDBOX_LIMITS.text), z.number().finite(), z.boolean(), z.null()]);

export type UiNode =
  | { type: "stack" | "row" | "list"; children: UiNode[] }
  | { type: "heading" | "badge"; text: string }
  | { type: "text"; text: string; tone?: "muted" | "danger" | "success" }
  | { type: "button"; label: string; action: string; payload?: string | number | boolean | null; variant?: "primary" | "outline" | "danger" }
  | { type: "input"; name: string; label: string; kind?: "text" | "number" | "date"; value?: string }
  | { type: "checkbox"; name: string; label: string; checked?: boolean }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "progress"; value: number; max: number; label?: string };

const node: z.ZodType<UiNode> = z.lazy(() => z.discriminatedUnion("type", [
  z.strictObject({ type: z.enum(["stack", "row", "list"]), children: z.array(node).max(SANDBOX_LIMITS.nodes) }),
  z.strictObject({ type: z.enum(["heading", "badge"]), text }),
  z.strictObject({ type: z.literal("text"), text, tone: z.enum(["muted", "danger", "success"]).optional() }),
  z.strictObject({ type: z.literal("button"), label: text.min(1), action: name, payload: json.optional(), variant: z.enum(["primary", "outline", "danger"]).optional() }),
  z.strictObject({ type: z.literal("input"), name, label: text.min(1), kind: z.enum(["text", "number", "date"]).optional(), value: text.optional() }),
  z.strictObject({ type: z.literal("checkbox"), name, label: text.min(1), checked: z.boolean().optional() }),
  z.strictObject({ type: z.literal("table"), columns: z.array(text).max(SANDBOX_LIMITS.tableColumns), rows: z.array(z.array(text).max(SANDBOX_LIMITS.tableColumns)).max(SANDBOX_LIMITS.tableRows) }),
  z.strictObject({ type: z.literal("progress"), value: z.number().finite(), max: z.number().finite().positive(), label: text.optional() }),
]) as z.ZodType<UiNode>);

/** A tree the host may draw: schema-valid and within the node/depth limits. Throws otherwise. */
export function parseUiTree(input: unknown): UiNode {
  const tree = node.parse(input);
  let count = 0;
  const walk = (current: UiNode, depth: number) => {
    if (++count > SANDBOX_LIMITS.nodes) throw new Error(`The UI has more than ${SANDBOX_LIMITS.nodes} elements.`);
    if (depth > SANDBOX_LIMITS.depth) throw new Error(`The UI is nested deeper than ${SANDBOX_LIMITS.depth} levels.`);
    if ("children" in current) for (const child of current.children) walk(child, depth + 1);
  };
  walk(tree, 1);
  return tree;
}

export const sandboxChangeSchema = z.strictObject({
  upsert: z.array(z.strictObject({ id: z.uuid().optional(), entity: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), values: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), json) })).max(SANDBOX_LIMITS.changes).optional(),
  remove: z.array(z.uuid()).max(SANDBOX_LIMITS.changes).optional(),
});
export type SandboxChange = z.infer<typeof sandboxChangeSchema>;

type Values = Record<string, string | number | boolean | null>;
type Record_ = { id: string; entity: string; values: Values };

/** The records after a change: upserts replace by id (new ones get `newId()`), removals drop. Validation is the caller's. */
export function applySandboxChange<R extends Record_>(records: readonly R[], change: SandboxChange, newId: () => string): Record_[] {
  const removed = new Set(change.remove ?? []);
  const next: Record_[] = records.filter((record) => !removed.has(record.id));
  for (const upsert of change.upsert ?? []) {
    const index = upsert.id ? next.findIndex((record) => record.id === upsert.id) : -1;
    if (index >= 0) next[index] = { id: next[index].id, entity: upsert.entity, values: upsert.values };
    else next.push({ id: upsert.id ?? newId(), entity: upsert.entity, values: upsert.values });
  }
  return next;
}

/**
 * Runs first in the worker: removes every network/storage/worker entry point
 * (the CSP already blocks them - this is the second wall), then exposes
 * `guidon.module({ render, onAction })` and a console that reports to the
 * host. The module's source is wrapped in a function so it can't redeclare
 * those names.
 */
export const WORKER_PRELUDE = `"use strict";
(() => {
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "BroadcastChannel", "Worker", "SharedWorker", "WebTransport", "navigator"]) {
    for (let target = self; target; target = Object.getPrototypeOf(target)) {
      try { delete target[name]; } catch {}
    }
    try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch {}
  }
})();
let __definition = null;
const __post = self.postMessage.bind(self);
let __logs = 0;
const __log = (level, values) => {
  if (++__logs > ${SANDBOX_LIMITS.logs}) return;
  __post({ type: "log", level, text: values.map((value) => { try { return typeof value === "string" ? value : JSON.stringify(value); } catch { return String(value); } }).join(" ").slice(0, ${SANDBOX_LIMITS.text}) });
};
const __guidon = Object.freeze({ module(definition) {
  if (__definition) throw new Error("guidon.module() can be called once.");
  if (!definition || typeof definition.render !== "function") throw new Error("guidon.module() needs a render(ctx) function.");
  __definition = definition;
} });
const __console = Object.freeze({ log: (...v) => __log("log", v), info: (...v) => __log("log", v), warn: (...v) => __log("warn", v), error: (...v) => __log("error", v) });
self.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== "object" || typeof message.id !== "number") return;
  try {
    if (!__definition) throw new Error("The module didn't call guidon.module({ render }).");
    const ctx = Object.freeze({ records: message.records, entities: message.entities, form: message.form, canWrite: message.canWrite });
    if (message.type === "render") __post({ type: "result", id: message.id, tree: __definition.render(ctx) });
    else if (message.type === "action") {
      const change = typeof __definition.onAction === "function" ? __definition.onAction(message.action, message.payload, ctx) : null;
      __post({ type: "result", id: message.id, change: change ?? null });
    }
  } catch (error) {
    __post({ type: "error", id: message.id, message: String(error && error.message ? error.message : error).slice(0, ${SANDBOX_LIMITS.text}) });
  }
};
(function (guidon, console, self, globalThis, postMessage, onmessage) {
`;
export const WORKER_EPILOGUE = `
})(__guidon, __console, undefined, undefined, undefined, undefined);
__post({ type: __definition ? "ready" : "error", id: -1, message: __definition ? undefined : "The module didn't call guidon.module({ render })." });
`;

/**
 * The sandboxed frame. It shows nothing; it only relays between the host
 * page and the worker. Its own CSP allows its inline script and a blob:
 * worker and nothing else - no connections, images, frames or forms.
 */
export const SANDBOX_FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
</head><body><script>
"use strict";
let worker = null;
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "init" && !worker && typeof message.source === "string" && typeof message.prelude === "string" && typeof message.epilogue === "string") {
    const url = URL.createObjectURL(new Blob([message.prelude, message.source, message.epilogue], { type: "text/javascript" }));
    worker = new Worker(url);
    // Revoked once the worker has loaded: not every engine resolves the URL in the constructor.
    let revoked = false;
    const revoke = () => { if (!revoked) { revoked = true; URL.revokeObjectURL(url); } };
    worker.onmessage = (inner) => { revoke(); window.parent.postMessage({ channel: "guidon-sandbox", ...inner.data }, "*"); };
    worker.onerror = (error) => { revoke(); error.preventDefault(); window.parent.postMessage({ channel: "guidon-sandbox", type: "error", id: -1, message: String(error.message || "Script error").slice(0, 2000) }, "*"); };
  } else if (worker && (message.type === "render" || message.type === "action")) {
    worker.postMessage(message);
  }
});
window.parent.postMessage({ channel: "guidon-sandbox", type: "frame" }, "*");
</script></body></html>`;
