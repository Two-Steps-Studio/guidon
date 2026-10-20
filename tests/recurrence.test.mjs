/**
 * Recurring tasks (src/lib/work/recurrence-core.ts): next due dates and what
 * the next occurrence copies. recurrence-core.ts has no imports, so Node's
 * built-in type stripping runs it.
 */
import { advance, nextDueDate, normalizeRecurrence, resetChecklist } from "../src/lib/work/recurrence-core.ts";

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
const iso = (d) => d.toISOString().slice(0, 10);

console.log("\n  advance");
check("weekly +1", iso(advance(new Date("2026-10-19T09:00:00Z"), "weekly", 1)) === "2026-10-26");
check("every 2 weeks", iso(advance(new Date("2026-10-19T09:00:00Z"), "weekly", 2)) === "2026-11-02");
check("every 3 days", iso(advance(new Date("2026-10-30T09:00:00Z"), "every_n_days", 3)) === "2026-11-02");
check("monthly keeps the day", iso(advance(new Date("2026-10-15T09:00:00Z"), "monthly", 1)) === "2026-11-15");
check("31 Jan + 1 month = 28 Feb", iso(advance(new Date("2027-01-31T09:00:00Z"), "monthly", 1)) === "2027-02-28");
check("31 Jan 2028 + 1 month = 29 Feb (leap)", iso(advance(new Date("2028-01-31T09:00:00Z"), "monthly", 1)) === "2028-02-29");
check("Dec + 1 month = next year", iso(advance(new Date("2026-12-10T09:00:00Z"), "monthly", 1)) === "2027-01-10");
check("quarterly (3 months)", iso(advance(new Date("2026-11-30T09:00:00Z"), "monthly", 3)) === "2027-02-28");
check("time of day kept", advance(new Date("2026-10-19T17:30:00Z"), "weekly", 1).toISOString() === "2026-10-26T17:30:00.000Z");

console.log("\n  nextDueDate");
const now = new Date("2026-10-21T12:00:00Z"); // Wednesday
check("on time: one step", iso(nextDueDate("2026-10-22T09:00:00Z", "weekly", 1, now)) === "2026-10-29");
check("late: keeps the rhythm, next future Monday", iso(nextDueDate("2026-10-19T09:00:00Z", "weekly", 1, now)) === "2026-10-26");
check("very late daily catches up to tomorrow", iso(nextDueDate("2025-01-01T12:00:00Z", "every_n_days", 1, now)) === "2026-10-22");
check("no due date: one step from now", iso(nextDueDate(null, "every_n_days", 10, now)) === "2026-10-31");
check("result always in the future", nextDueDate("2026-10-21T11:59:00Z", "every_n_days", 1, now) > now);

console.log("\n  normalizeRecurrence");
check("valid", JSON.stringify(normalizeRecurrence("weekly", 2)) === '{"recurrence_rule":"weekly","recurrence_interval":2}');
check("string interval", normalizeRecurrence("monthly", "3")?.recurrence_interval === 3);
check("unknown rule -> null", normalizeRecurrence("yearly", 1) === null);
check("0 -> null", normalizeRecurrence("weekly", 0) === null);
check("366 -> null", normalizeRecurrence("every_n_days", 366) === null);
check("1.5 -> null", normalizeRecurrence("every_n_days", 1.5) === null);
check("null rule -> null (doesn't repeat)", normalizeRecurrence(null, null) === null);

console.log("\n  resetChecklist");
check(
  "ticked items unticked, rest unchanged",
  resetChecklist("Steps:\n- [x] one\n- [X] two\n  * [ ] three\n1. [x] four\nText [x] stays") ===
    "Steps:\n- [ ] one\n- [ ] two\n  * [ ] three\n1. [ ] four\nText [x] stays"
);
check("null stays null", resetChecklist(null) === null);

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
