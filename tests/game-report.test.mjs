#!/usr/bin/env node
/**
 * In-game report validation/formatting (src/lib/api/game-report.ts) - the
 * rules that stand between a game build's extractable API key and the
 * project's task list.
 *
 *   npm run test:reports
 *
 * game-report.ts has no imports on purpose, so Node's built-in TypeScript
 * type stripping can load it directly (no `@/` alias, no "server-only").
 */

import { buildReport, parseMetadata, validateReportFiles, REPORT_LIMITS } from "../src/lib/api/game-report.ts";
import { reportsScopeMixedWithOthers } from "../src/lib/api/scopes.ts";

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

console.log("\n  buildReport");
{
  const r = buildReport({
    title: "  Fell through\nthe floor ",
    description: "Walked into the castle gate and fell.",
    category: "Crash",
    reporter: "Tester | Bob",
    metadata: JSON.stringify({ build: "1.2.3", scene: "Castle", "pos|x": 12.5, vsync: true }),
  });
  check("ok", r.ok, JSON.stringify(r));
  check("title prefixed by category, one line", r.value.title === "[Crash] Fell through the floor", r.value.title);
  check("tags", JSON.stringify(r.value.tags) === '["crash","in-game"]');
  check("description keeps body", r.value.description.startsWith("Walked into the castle gate and fell.\n\n---"));
  check("reporter escaped", r.value.description.includes("by **Tester \\| Bob**"));
  check("metadata table, pipes escaped", r.value.description.includes("| pos\\|x | 12.5 |") && r.value.description.includes("| build | 1.2.3 |"));
}
check("title required", buildReport({ title: "   " }).ok === false);
check("unknown category -> bug", buildReport({ title: "x", category: "rm -rf" }).value.title === "[Bug] x");
check("long title capped", buildReport({ title: "a".repeat(1000) }).value.title.length <= REPORT_LIMITS.titleLength + 6);
check("long description capped", buildReport({ title: "x", description: "d".repeat(50_000) }).value.description.length < REPORT_LIMITS.descriptionLength + 200);
check("no metadata -> no table", !buildReport({ title: "x" }).value.description.includes("| Field |"));

console.log("\n  parseMetadata");
check("not JSON rejected", parseMetadata("{nope").ok === false);
check("array rejected", parseMetadata("[1,2]").ok === false);
check("nested value rejected", parseMetadata('{"a":{"b":1}}').ok === false);
check("too many entries rejected", parseMetadata(JSON.stringify(Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, i])))).ok === false);
check("newlines in values flattened", parseMetadata('{"log":"a\\nb\\u0000c"}').value[0][1] === "a b c");
check("long value capped", parseMetadata(JSON.stringify({ v: "x".repeat(5000) })).value[0][1].length === REPORT_LIMITS.metadataValueLength);

console.log("\n  validateReportFiles");
check("png + log accepted", validateReportFiles([{ name: "shot.PNG", size: 10 }, { name: "Player.log", size: 5 }]).ok);
check("svg rejected", validateReportFiles([{ name: "x.svg", size: 10 }]).ok === false);
check("exe rejected", validateReportFiles([{ name: "x.exe", size: 10 }]).ok === false);
check("no extension rejected", validateReportFiles([{ name: "README", size: 10 }]).ok === false);
check("empty rejected", validateReportFiles([{ name: "x.png", size: 0 }]).ok === false);
check("too big rejected", validateReportFiles([{ name: "x.png", size: REPORT_LIMITS.fileBytes + 1 }]).ok === false);
check("too many rejected", validateReportFiles(Array.from({ length: 4 }, () => ({ name: "x.png", size: 1 }))).ok === false);
check("path separators neutralized", validateReportFiles([{ name: "../../etc/x.txt", size: 1 }]).value[0] === ".._.._etc_x.txt");
{
  const r = validateReportFiles([{ name: "a".repeat(300) + ".png", size: 1 }]);
  check("long name keeps extension", r.ok && r.value[0].endsWith(".png") && r.value[0].length <= REPORT_LIMITS.fileNameLength, r.value?.[0]?.length);
}

console.log("\n  report key scopes");
check("reports:write alone is allowed", !reportsScopeMixedWithOthers(["reports:write"]));
check("reports:write + tasks:read is refused", reportsScopeMixedWithOthers(["reports:write", "tasks:read"]));
check("keys without reports:write are unaffected", !reportsScopeMixedWithOthers(["tasks:read", "tasks:write"]));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
