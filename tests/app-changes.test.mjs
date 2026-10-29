// What an app changed on a task and how it is undone (src/lib/work/app-changes-core.ts):
// diffs, what gets stored, parsing stored rows, and undo that never overwrites a later edit.
import assert from "node:assert/strict";
import { appChangeDetails, diffTaskFields, isRestorable, parseAppChange, parseUndo, undoPatch } from "../src/lib/work/app-changes-core.ts";
import { decisionRefusal, effectiveStatus, parseApprovalRequestBody, sortInbox } from "../src/lib/work/agent-approvals-core.ts";

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

console.log("\n  Approval requests");
check("a request names one of the two actions", () => {
  assert.deepEqual(parseApprovalRequestBody({ action: "complete_task", reason: "  CI is green  " }), { action: "complete_task", reason: "CI is green" });
  assert.deepEqual(parseApprovalRequestBody({ action: "delete_task" }), { action: "delete_task", reason: null });
  assert.ok("error" in parseApprovalRequestBody({ action: "drop_project" }));
  assert.ok("error" in parseApprovalRequestBody({}));
  assert.ok("error" in parseApprovalRequestBody(null));
  assert.ok("error" in parseApprovalRequestBody([]));
});
check("the reason is text with a bound", () => {
  assert.ok("error" in parseApprovalRequestBody({ action: "complete_task", reason: 5 }));
  assert.ok("error" in parseApprovalRequestBody({ action: "complete_task", reason: "x".repeat(2001) }));
  assert.deepEqual(parseApprovalRequestBody({ action: "complete_task", reason: "   " }), { action: "complete_task", reason: null });
});
const now = new Date("2026-10-28T12:00:00Z");
check("a waiting request past its expiry reads as expired", () => {
  assert.equal(effectiveStatus({ status: "pending", expires_at: "2026-10-28T11:59:59Z" }, now), "expired");
  assert.equal(effectiveStatus({ status: "pending", expires_at: "2026-10-29T00:00:00Z" }, now), "pending");
  assert.equal(effectiveStatus({ status: "approved", expires_at: "2026-10-01T00:00:00Z" }, now), "approved");
});
check("the inbox shows waiting requests first, the one expiring soonest on top", () => {
  const rows = [
    { id: "old-decided", status: "rejected", created_at: "2026-10-20T00:00:00Z", expires_at: "2026-10-27T00:00:00Z" },
    { id: "late", status: "pending", created_at: "2026-10-28T10:00:00Z", expires_at: "2026-11-04T10:00:00Z" },
    { id: "new-decided", status: "approved", created_at: "2026-10-26T00:00:00Z", expires_at: "2026-11-02T00:00:00Z" },
    { id: "soon", status: "pending", created_at: "2026-10-22T00:00:00Z", expires_at: "2026-10-29T00:00:00Z" },
    { id: "lapsed", status: "pending", created_at: "2026-10-27T00:00:00Z", expires_at: "2026-10-28T00:00:00Z" },
  ];
  assert.deepEqual(sortInbox(rows, now).map((row) => row.id), ["soon", "late", "lapsed", "new-decided", "old-decided"]);
});
check("database refusals are told apart", () => {
  assert.equal(decisionRefusal("Already decided"), "already_decided");
  assert.equal(decisionRefusal("Expired"), "expired");
  assert.equal(decisionRefusal("The task no longer exists"), "task_gone");
  assert.equal(decisionRefusal("Only project owners and admins can decide"), "forbidden");
  assert.equal(decisionRefusal("something internal: relation x"), "unknown");
  assert.equal(decisionRefusal(undefined), "unknown");
});

console.log(`\n  ${passed} pass / ${failed} fail\n`);
process.exit(failed ? 1 : 0);
