import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { moduleManifestSchema } from "../src/lib/work/module-manifest.ts";
import { hasExactModuleConsent, parseModuleRecords, unsupportedModulePermissions } from "../src/lib/work/module-records.ts";
import { ModuleView } from "../src/lib/work/module-view.ts";

const manifest = moduleManifestSchema.parse(JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning.json", import.meta.url), "utf8")));
const fixture = JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning-data.json", import.meta.url), "utf8"));
const records = parseModuleRecords(manifest, fixture);
const labels = { empty: "Empty", yes: "Yes", no: "No", ungrouped: "Unassigned", unscheduled: "Unscheduled", edit: "Edit", remove: "Remove", actions: "Actions", count: "Record count" };

assert.equal(records.length, 2);
for (const change of [
  { entity: "foreign-entity" },
  { values: { name: "x", status: "unapproved" } },
  { values: { name: "x", status: "planned", due: "2026-02-30" } },
  { values: { name: 42, status: "planned" } },
  { values: { status: "planned" } },
  { values: { name: "x", status: "planned", forbidden: "value" } },
]) assert.throws(() => parseModuleRecords(manifest, [{ ...records[0], ...change }]));
assert.throws(() => parseModuleRecords(manifest, [records[0], records[0]]));
assert.throws(() => parseModuleRecords(manifest, Array.from({ length: 1001 }, () => records[0])));
assert.deepEqual(unsupportedModulePermissions(manifest), []);
assert.deepEqual(unsupportedModulePermissions({ ...manifest, permissions: ["tasks:write"] }), ["tasks:write"]);
console.log("pass runtime rejects invalid fields, dates, entities, duplicate IDs, excess rows and unsupported capabilities");
assert.equal(hasExactModuleConsent(manifest, [...manifest.permissions].reverse()), true);
for (const consent of [[], ["module-data:read"], ["module-data:read", "module-data:read"], [...manifest.permissions, "tasks:write"], null]) {
  assert.equal(hasExactModuleConsent(manifest, consent), false);
}
console.log("pass permission consent must cover exactly the requested scopes");

const typed = structuredClone(manifest);
typed.entities[0].fields.push({ id: "score", name: "Score", type: "number", required: true, min: 0, max: 10 }, { id: "done", name: "Done", type: "boolean", required: true });
const typedRecord = { ...records[0], values: { ...records[0].values, score: 0, done: false } };
assert.equal(parseModuleRecords(typed, [typedRecord])[0].values.done, false);
for (const score of [-1, 11, "1", Infinity]) {
  assert.throws(() => parseModuleRecords(typed, [{ ...typedRecord, values: { ...typedRecord.values, score } }]));
}
assert.throws(() => parseModuleRecords(typed, [{ ...typedRecord, values: { ...typedRecord.values, done: "false" } }]));
console.log("pass numeric limits and strict boolean typing preserve valid zero/false values");

for (const view of manifest.views) {
  const html = renderToStaticMarkup(createElement(ModuleView, { manifest, view, records, labels }));
  if (view.type === "form") assert.equal(html, ""); // Client form owns mutations, not the display renderer.
  else if (view.type === "chart") { assert.match(html, /Record count/); assert.match(html, /Planned/); }
  else assert.match(html, /First release/);
}
console.log("pass all five declared views have a valid rendering path");

const attack = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
for (const view of manifest.views.filter((view) => view.type !== "form")) {
  const malicious = parseModuleRecords(manifest, [{ ...records[0], values: { ...records[0].values, name: attack } }]);
  const untrustedLabels = structuredClone(manifest);
  untrustedLabels.entities[0].fields.find((field) => field.id === "status").options[0].label = attack;
  const html = renderToStaticMarkup(createElement(ModuleView, { manifest: untrustedLabels, view, records: malicious, labels }));
  assert.equal(/<img|<script|onerror="/.test(html), false);
  assert.match(html, /&lt;img/);
}
console.log("pass all data views escape untrusted record text and option labels");

for (const view of [
  { id: "bad", name: "Bad", type: "calendar", entity: "release", fields: ["name"], dateField: "name" },
  { id: "bad", name: "Bad", type: "chart", entity: "release", fields: ["name"], groupBy: "name" },
]) assert.equal(moduleManifestSchema.safeParse({ ...manifest, views: [view] }).success, false);
console.log("pass chart and calendar reject invalid field mappings");
