#!/usr/bin/env node
/**
 * Label presets (src/lib/work/label-presets.ts): starter sets are complete
 * in every locale and valid as presets (name length, colour, no duplicates).
 *
 *   npm run test:labels
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LABEL_NAME_MAX_LENGTH,
  LABEL_STARTER_SETS,
  findLabelPreset,
  isValidLabelColor,
} from "../src/lib/work/label-presets.ts";
import { PROJECT_MODULES, PROJECT_TEMPLATES, isProjectTemplate } from "../src/lib/work/project-modules.ts";

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

const root = fileURLToPath(new URL("..", import.meta.url));

for (const locale of ["en", "pl", "de", "es"]) {
  console.log(`\n  starter sets: ${locale}`);
  const messages = JSON.parse(readFileSync(join(root, "messages", `${locale}.json`), "utf8"));
  const starter = messages.settings?.labelStarter ?? {};
  for (const [set, labels] of Object.entries(LABEL_STARTER_SETS)) {
    check(`${set}: has a title`, typeof starter[set]?.title === "string" && starter[set].title.length > 0);
    const names = labels.map(([key]) => starter[set]?.[key]);
    const missing = labels.filter(([key]) => typeof starter[set]?.[key] !== "string").map(([key]) => key);
    check(`${set}: every label translated`, missing.length === 0, missing.join(", "));
    check(
      `${set}: names are valid presets`,
      names.every((n) => typeof n === "string" && n === n.trim() && n.length > 0 && n.length <= LABEL_NAME_MAX_LENGTH && !n.includes(","))
    );
    const lower = names.map((n) => String(n).toLowerCase());
    check(`${set}: no duplicate names`, new Set(lower).size === lower.length);
  }
}

console.log("\n  colours and lookup");
check("every starter colour is #rrggbb", Object.values(LABEL_STARTER_SETS).flat().every(([, color]) => isValidLabelColor(color)));
const presets = [{ id: "1", name: "Bug", color: "#ef4444", sort_order: 0 }];
check("findLabelPreset is case-insensitive", findLabelPreset(presets, " bug ")?.id === "1");
check("findLabelPreset misses unknown tags", findLabelPreset(presets, "ui") === undefined);

console.log("\n  project templates");
check("every template has a label set of the same name", Object.keys(PROJECT_TEMPLATES).every((k) => k in LABEL_STARTER_SETS));
check("every label set is offered as a template", Object.keys(LABEL_STARTER_SETS).every((k) => k in PROJECT_TEMPLATES));
check(
  "templates only hide real modules",
  Object.values(PROJECT_TEMPLATES).every((tpl) => tpl.disabledModules.every((m) => PROJECT_MODULES.includes(m)))
);
check("isProjectTemplate rejects prototype keys", !isProjectTemplate("toString") && !isProjectTemplate("__proto__") && isProjectTemplate("gamedev"));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
