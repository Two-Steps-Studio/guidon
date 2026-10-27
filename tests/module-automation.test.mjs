import assert from "node:assert/strict";

const { moduleManifestSchema } = await import("../src/lib/work/module-manifest.ts");
const { diffRecordEvents, planAutomationRuns, fillTemplate, nextAutomationAttempt, MAX_RUNS_PER_SAVE } = await import("../src/lib/work/module-automation.ts");
const { unsupportedModulePermissions } = await import("../src/lib/work/module-records.ts");
let passed = 0;
function test(name, run) { run(); passed++; console.log(`pass ${name}`); }

const base = {
  manifestVersion: 1, id: "bugs", name: "Bugs", version: "1.0.0", author: { name: "QA" }, engine: { minVersion: "1.2.0" },
  permissions: ["module-data:read", "module-data:write", "tasks:write", "notifications:send", "webhooks:send"],
  entities: [{ id: "bug", name: "Bug", fields: [{ id: "title", name: "Title", type: "text", required: true }, { id: "severity", name: "Severity", type: "select", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }] }] }],
  views: [{ id: "all", name: "All", type: "table", entity: "bug", fields: ["title", "severity"] }],
  automations: [
    { id: "triage", name: "Triage high bugs", trigger: { event: "record.created", entity: "bug", when: { field: "severity", equals: "high" } }, actions: [{ type: "create_task", title: "Fix: {{title}}", priority: "high" }, { type: "notify", title: "High bug {{ title }}" }] },
    { id: "announce", name: "Announce removals", trigger: { event: "record.deleted", entity: "bug" }, actions: [{ type: "webhook" }] },
  ],
};
const record = (id, values) => ({ id: `00000000-0000-4000-8000-00000000000${id}`, entity: "bug", values });

test("automations validate references, permissions and engine; all their scopes are supported by the runtime", () => {
  const manifest = moduleManifestSchema.parse(base);
  assert.equal(unsupportedModulePermissions(manifest).length, 0);
  assert.equal(moduleManifestSchema.safeParse({ ...base, engine: { minVersion: "1.1.0" } }).success, false, "automations need engine 1.2");
  assert.equal(moduleManifestSchema.safeParse({ ...base, permissions: ["module-data:read", "module-data:write", "notifications:send", "webhooks:send"] }).success, false, "create_task needs tasks:write");
  assert.equal(moduleManifestSchema.safeParse({ ...base, automations: [{ ...base.automations[0], trigger: { event: "record.created", entity: "nope" } }] }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...base, automations: [{ ...base.automations[0], trigger: { event: "record.created", entity: "bug", when: { field: "nope", equals: 1 } } }] }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...base, automations: [base.automations[0], base.automations[0]] }).success, false, "unique ids");
  assert.equal(moduleManifestSchema.safeParse({ ...base, automations: [{ ...base.automations[0], actions: [{ type: "run_script", code: "x" }] }] }).success, false, "closed action list");
  assert.equal(moduleManifestSchema.safeParse({ ...base, automations: [{ ...base.automations[0], actions: Array(6).fill({ type: "webhook" }) }] }).success, false, "at most five actions");
  const { automations, ...plain } = base;
  assert.equal("automations" in moduleManifestSchema.parse({ ...plain, engine: { minVersion: "1.0.0" } }), false, "absent automations stay absent (stable digests)");
  assert.ok(automations);
});

test("a save yields created, updated and deleted events; unchanged records yield none", () => {
  const before = [record(1, { title: "A", severity: "low" }), record(2, { title: "B", severity: "low" }), record(3, { title: "C", severity: "low" })];
  const after = [record(1, { title: "A", severity: "low" }), record(2, { title: "B2", severity: "low" }), record(4, { title: "D", severity: "high" })];
  assert.deepEqual(diffRecordEvents(before, after).map((event) => `${event.event}:${event.record.values.title}`), ["record.updated:B2", "record.created:D", "record.deleted:C"]);
  assert.deepEqual(diffRecordEvents(before, before), []);
});

test("runs follow triggers and conditions; dedupe keys include the revision", () => {
  const manifest = moduleManifestSchema.parse(base);
  const events = diffRecordEvents([record(3, { title: "C" })], [record(4, { title: "Low", severity: "low" }), record(5, { title: "Crash", severity: "high" })]);
  const runs = planAutomationRuns(manifest, events, 7);
  assert.deepEqual(runs.map((run) => `${run.automationId}:${run.values.title ?? ""}:${run.event}`), ["triage:Crash:record.created", "announce:C:record.deleted"]);
  assert.equal(runs[0].dedupeKey, `bugs:triage:${record(5).id}:record.created:r7`);
  assert.notEqual(planAutomationRuns(manifest, events, 8)[0].dedupeKey, runs[0].dedupeKey);
  const many = Array.from({ length: 80 }, (_, index) => ({ event: "record.deleted", record: { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, entity: "bug", values: {} } }));
  assert.equal(planAutomationRuns(manifest, many, 1).length, MAX_RUNS_PER_SAVE);
});

test("templates fill plain text values only, bounded to 200 characters", () => {
  assert.equal(fillTemplate("Fix: {{title}} ({{ severity }})", { title: "<b>Crash</b>", severity: "high" }), "Fix: <b>Crash</b> (high)");
  assert.equal(fillTemplate("{{missing}}", {}), "Module automation");
  assert.equal(fillTemplate("{{t}}", { t: "x".repeat(500) }).length, 200);
  assert.equal(fillTemplate("{{done}} {{n}}", { done: false, n: 0 }), "false 0");
});

test("retries back off and stop after the fifth attempt", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.deepEqual([1, 2, 3, 4].map((attempt) => (nextAutomationAttempt(attempt, now).getTime() - now.getTime()) / 60000), [1, 5, 30, 120]);
  assert.equal(nextAutomationAttempt(5, now), null);
});

console.log(`${passed} module automation test groups passed`);
