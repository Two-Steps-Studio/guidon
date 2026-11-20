// Project cleanup review (src/lib/work/task-cleanup-core.ts): which titles
// count as duplicates, which twin is kept, stale/overdue/unassigned lists.
import assert from "node:assert/strict";
import { formatCleanupReport, reviewTasks, similarTitles } from "../src/lib/work/task-cleanup-core.ts";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  pass  ${name}`); }
  catch (error) { failed++; console.log(`  FAIL  ${name}\n        ${error.message}`); }
}

const now = new Date("2026-11-20T12:00:00Z");
let n = 0;
const task = (title, extra = {}) => ({ id: `t${++n}`, title, status: "todo", is_done: false, parent_task_id: null, assignee_id: "u1", due_date: null, updated_at: "2026-11-10T00:00:00Z", ...extra });

console.log("\n  Similar titles");
check("same text, other case and diacritics", () => assert.ok(similarTitles("Naprawić logowanie", "naprawic  LOGOWANIE")));
check("a typo in a long title", () => assert.ok(similarTitles("Fix login redirect loop", "Fix login redirect lopo")));
check("same words in another order", () => assert.ok(similarTitles("Add dark mode to settings", "settings: add dark mode to")));
check("short different titles are not duplicates", () => assert.ok(!similarTitles("Fix login", "Fix logout")));
check("related but different tasks are not duplicates", () => assert.ok(!similarTitles("Add dark mode to settings page", "Add light mode to landing page")));
check("titles with different numbers are different tasks", () => {
  assert.ok(!similarTitles("Fix login page for module 0", "Fix login page for module 80"));
  assert.ok(!similarTitles("Bug 12: crash on start", "Bug 13: crash on start"));
  assert.ok(similarTitles("Release v2 notes", "release v2 notes"));
});
check("empty titles never match", () => assert.ok(!similarTitles("", "")));

console.log("\n  Review");
check("duplicates group, open one kept over done", () => {
  const done = task("Write release notes", { is_done: true, status: "done", updated_at: "2026-11-19T00:00:00Z" });
  const open = task("write release notes");
  const report = reviewTasks([done, open, task("Something else entirely")], now);
  assert.equal(report.duplicates.length, 1);
  assert.equal(report.duplicates[0].keep.id, open.id);
  assert.deepEqual(report.duplicates[0].duplicates.map((t) => t.id), [done.id]);
});
check("the most recently touched open twin is kept", () => {
  const older = task("Update the pricing page", { updated_at: "2026-10-01T00:00:00Z" });
  const newer = task("Update the pricing page", { updated_at: "2026-11-15T00:00:00Z" });
  assert.equal(reviewTasks([older, newer], now).duplicates[0].keep.id, newer.id);
});
check("two done twins are history, not a finding", () => {
  assert.equal(reviewTasks([task("Ship v1", { is_done: true }), task("Ship v1", { is_done: true })], now).duplicates.length, 0);
});
check("subtasks under different parents are not duplicates", () => {
  assert.equal(reviewTasks([task("Write tests", { parent_task_id: "a" }), task("Write tests", { parent_task_id: "b" })], now).duplicates.length, 0);
  assert.equal(reviewTasks([task("Write tests", { parent_task_id: "a" }), task("Write tests", { parent_task_id: "a" })], now).duplicates.length, 1);
});
check("three twins make one group", () => {
  const report = reviewTasks([task("Fix the build"), task("fix the build"), task("Fix the build ")], now);
  assert.equal(report.duplicates.length, 1);
  assert.equal(report.duplicates[0].duplicates.length, 2);
});
check("stale, overdue and unassigned in progress (open only)", () => {
  const stale = task("Old idea", { updated_at: "2026-08-01T00:00:00Z" });
  const overdue = task("Late", { due_date: "2026-11-19" });
  const dueToday = task("Due today", { due_date: "2026-11-20" });
  const orphan = task("Nobody on it", { status: "in_progress", assignee_id: null });
  const doneOld = task("Done long ago", { is_done: true, updated_at: "2026-01-01T00:00:00Z", due_date: "2026-01-01" });
  const report = reviewTasks([stale, overdue, dueToday, orphan, doneOld], now);
  assert.deepEqual(report.stale.map((t) => t.id), [stale.id]);
  assert.deepEqual(report.overdue.map((t) => t.id), [overdue.id]);
  assert.deepEqual(report.unassignedInProgress.map((t) => t.id), [orphan.id]);
});
check("report text has ids and skips empty sections", () => {
  const twin = task("Same thing");
  const text = formatCleanupReport(reviewTasks([twin, task("Same thing")], now), 2);
  assert.match(text, /Likely duplicates/);
  assert.ok(text.includes(twin.id));
  assert.ok(!text.includes("Overdue"));
  assert.equal(formatCleanupReport(reviewTasks([task("Alone")], now), 1), "Reviewed 1 task(s): nothing to clean up.");
});

console.log(`\n  ${passed} pass / ${failed} fail\n`);
if (failed) process.exit(1);
