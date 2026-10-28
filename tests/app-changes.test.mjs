// What an app changed on a task and how it is undone (src/lib/work/app-changes-core.ts):
// diffs, what gets stored, parsing stored rows, and undo that never overwrites a later edit.
import assert from "node:assert/strict";
import { appChangeDetails, diffTaskFields, isRestorable, parseAppChange, parseUndo, undoPatch } from "../src/lib/work/app-changes-core.ts";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  pass  ${name}`); }
  catch (error) { failed++; console.log(`  FAIL  ${name}\n        ${error.message}`); }
}

const before = { title: "Fix login", description: null, status: "todo", priority: "medium", due_date: "2026-11-02T00:00:00+00:00", sort_order: 3 };

console.log("\n  Diff");
check("only tracked fields that really change", () => assert.deepEqual(
  diffTaskFields(before, { title: "Fix login redirect", priority: "medium", sort_order: 9 }),
  { title: { from: "Fix login", to: "Fix login redirect" } },
));
check("empty text and null are the same", () => assert.deepEqual(diffTaskFields(before, { description: "" }), {}));
check("the same instant in another format is no change", () => assert.deepEqual(diffTaskFields(before, { due_date: "2026-11-02T00:00:00.000Z" }), {}));
check("clearing a due date is a change", () => assert.deepEqual(
  diffTaskFields(before, { due_date: null }),
  { due_date: { from: "2026-11-02T00:00:00.000Z", to: null } },
));
check("a status move is recorded", () => assert.deepEqual(diffTaskFields(before, { status: "done" }), { status: { from: "todo", to: "done" } }));

console.log("\n  Stored details");
check("the key name is kept, trimmed and bounded", () => {
  const details = appChangeDetails("  Claude Code  ", { title: { from: "a", to: "b" } });
  assert.equal(details.key_name, "Claude Code");
  assert.equal(appChangeDetails("x".repeat(500), {}).key_name.length, 120);
  assert.equal(appChangeDetails("   ", {}).key_name, null);
});
check("very long text is cut and no longer offered for undo", () => {
  const long = "a".repeat(10000);
  const details = appChangeDetails(null, { description: { from: null, to: long } });
  assert.ok(details.changes.description.to.length < long.length);
  assert.equal(isRestorable(details.changes.description), false);
  assert.deepEqual(undoPatch(details.changes, { description: details.changes.description.to }).patch, {});
});
check("a stored row reads back", () => {
  const details = appChangeDetails("Cursor", { status: { from: "todo", to: "review" } });
  assert.deepEqual(parseAppChange(JSON.parse(JSON.stringify(details))), details);
});
check("rows that aren't an app's change are ignored", () => {
  assert.equal(parseAppChange(null), null);
  assert.equal(parseAppChange({}), null);
  assert.equal(parseAppChange({ via: "browser", changes: { title: { from: "a", to: "b" } } }), null);
  assert.equal(parseAppChange({ via: "api", changes: {} }), null);
  assert.equal(parseAppChange({ via: "api", changes: { title: { from: 1, to: "b" } } }), null);
  assert.equal(parseAppChange({ via: "api", changes: { title: "b" } }), null);
});
check("unknown fields in a row are dropped, not trusted", () => assert.deepEqual(
  parseAppChange({ via: "api", key_name: "x", changes: { title: { from: "a", to: "b" }, project_id: { from: "p1", to: "p2" } } }).changes,
  { title: { from: "a", to: "b" } },
));
check("an undo row reads back", () => assert.deepEqual(
  parseUndo({ undo_of: "log-1", changes: { status: { from: "review", to: "todo" } } }),
  { undo_of: "log-1", changes: { status: { from: "review", to: "todo" } } },
));

console.log("\n  Undo");
const change = { title: { from: "Fix login", to: "Fix login redirect" }, status: { from: "todo", to: "review" } };
check("puts back every field that still holds the app's value", () => {
  const result = undoPatch(change, { title: "Fix login redirect", status: "review" });
  assert.deepEqual(result.patch, { title: "Fix login", status: "todo" });
  assert.deepEqual(result.changedSince, []);
});
check("leaves a field someone changed since, and says so", () => {
  const result = undoPatch(change, { title: "Fix login redirect on Safari", status: "review" });
  assert.deepEqual(result.patch, { status: "todo" });
  assert.deepEqual(result.changedSince, ["title"]);
});
check("nothing to do when every field changed since", () => {
  const result = undoPatch(change, { title: "Other", status: "done" });
  assert.deepEqual(result.patch, {});
  assert.deepEqual(result.changedSince.sort(), ["status", "title"]);
});
check("restores a cleared value", () => assert.deepEqual(
  undoPatch({ due_date: { from: "2026-11-02T00:00:00.000Z", to: null } }, { due_date: null }).patch,
  { due_date: "2026-11-02T00:00:00.000Z" },
));
check("the undo row describes the reverse change", () => assert.deepEqual(
  undoPatch(change, { title: "Fix login redirect", status: "review" }).reverted,
  { title: { from: "Fix login redirect", to: "Fix login" }, status: { from: "review", to: "todo" } },
));

console.log(`\n  ${passed} pass / ${failed} fail\n`);
process.exit(failed ? 1 : 0);
