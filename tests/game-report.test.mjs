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
import { isOriginAllowed, parseAllowedOrigins } from "../src/lib/api/key-origins.ts";

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

console.log("\n  source (web widget)");
{
  const web = buildReport({ title: "Button does nothing", description: "Clicked Save", source: "web", reporter: "ana@example.com" });
  check("web: tagged web, not in-game", web.ok && JSON.stringify(web.value.tags) === '["bug","web"]', JSON.stringify(web.value?.tags));
  check("web: footer says website", web.ok && web.value.description.includes("Reported from the website by **ana@example.com**"));
  const game = buildReport({ title: "x" });
  check("no source: still a game report", game.ok && game.value.tags.includes("in-game") && game.value.description.includes("Reported from the game"));
  const odd = buildReport({ title: "x", source: "<script>" });
  check("unknown source falls back to game", odd.ok && odd.value.tags.includes("in-game"));
}

console.log("\n  allowed origins (widget keys, migration 054)");
{
  const parsed = parseAllowedOrigins("Shop.Example.com, https://shop.example.com/cart?x=1\nhttp://localhost:3000");
  check("bare host gets https, path dropped, lowercased, deduped", parsed.ok && JSON.stringify(parsed.value) === '["https://shop.example.com","http://localhost:3000"]', JSON.stringify(parsed));
  check("empty input = no restriction", parseAllowedOrigins("  ").ok && parseAllowedOrigins("  ").value.length === 0);
  check("ftp refused", !parseAllowedOrigins("ftp://x.com").ok);
  check("credentials refused", !parseAllowedOrigins("https://a:b@x.com").ok);
  check("garbage refused", !parseAllowedOrigins("http://").ok);
  check("more than 10 refused", !parseAllowedOrigins(Array.from({ length: 11 }, (_, i) => `s${i}.com`).join(",")).ok);
  check("no list allows anything", isOriginAllowed("https://evil.com", null) && isOriginAllowed(null, []));
  check("listed origin allowed (case-insensitive)", isOriginAllowed("https://Shop.Example.com", ["https://shop.example.com"]));
  check("other origin refused", !isOriginAllowed("https://evil.com", ["https://shop.example.com"]));
  check("subdomain is a different origin", !isOriginAllowed("https://a.shop.example.com", ["https://shop.example.com"]));
  check("missing Origin refused when a list is set", !isOriginAllowed(null, ["https://shop.example.com"]));
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
