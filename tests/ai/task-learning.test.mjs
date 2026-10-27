#!/usr/bin/env node
/**
 * "Learn from finished tasks" (src/lib/ai/task-learning-core.ts): which
 * tasks are worth an AI call, and reading the model's answer safely.
 *
 *   npm run test:ai
 */

import { isNearDuplicate, newFacts, parseLearnedFacts, taskHasSubstance } from "../../src/lib/ai/task-learning-core.ts";

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`    ${ok ? "pass" : "FAIL"}  ${label}${!ok && detail ? `  -> ${detail}` : ""}`);
};

console.log("\n  which tasks are worth learning from");
const bare = { title: "Fix typo", description: "", comments: [], attempts: [] };
check("a bare card is skipped", !taskHasSubstance(bare));
check("a long description counts", taskHasSubstance({ ...bare, description: "x".repeat(200) }));
check("description + comments add up", taskHasSubstance({ ...bare, description: "x".repeat(100), comments: ["y".repeat(70)] }));
check("whitespace doesn't count", !taskHasSubstance({ ...bare, description: " ".repeat(300) }));
check("any recorded attempt counts", taskHasSubstance({ ...bare, attempts: ["Outcome: failed"] }));

console.log("\n  reading the model's answer");
const two = '[{"type":"constraint","content":"Android builds must stay under 150 MB."},{"type":"fact","content":"Save files live in user://saves as JSON."}]';
check("plain JSON array", parseLearnedFacts(two).length === 2 && parseLearnedFacts(two)[0].type === "constraint");
check("inside a ```json fence with prose", parseLearnedFacts("Here you go:\n```json\n" + two + "\n```").length === 2);
check("empty array -> nothing", parseLearnedFacts("[]").length === 0);
check("no JSON -> nothing", parseLearnedFacts("Nothing durable here.").length === 0);
check("broken JSON -> nothing, no throw", parseLearnedFacts("[{\"type\": \"fact\", ").length === 0);
check("an object, not an array -> nothing", parseLearnedFacts('{"type":"fact","content":"Something long enough here"}').length === 0);
check("at most two", parseLearnedFacts(JSON.stringify(Array(5).fill({ type: "fact", content: "A durable fact about the game." }))).length === 2);
check("unknown type becomes fact", parseLearnedFacts('[{"type":"gossip","content":"The boss fight uses a state machine."}]')[0]?.type === "fact");
check("too-short or missing content dropped", parseLearnedFacts('[{"type":"fact","content":"ok"},{"type":"fact"},null,"x"]').length === 0);
check("long content trimmed to 600", parseLearnedFacts(JSON.stringify([{ type: "fact", content: "z".repeat(900) }]))[0].content.length === 600);

console.log("\n  not repeating what memory already says");
const memory = [
  'Android builds must stay under 150 MB. (constraint, from "Shrink the APK")',
  "Save files live in user://saves as JSON.",
  "Use Godot 4.3 for the client.",
];
check("same fact, other words around it", isNearDuplicate("All Android builds must stay under 150 MB", memory));
check("the learned suffix doesn't count", isNearDuplicate('Save files live in user://saves as JSON. (fact, from "Cloud saves")', memory));
check("a different fact about the same thing is new", !isNearDuplicate("Android builds are signed in CI with the upload key", memory));
check("another version number is a new fact", !isNearDuplicate("Use Godot 3.5 for the client", memory));
check("unrelated fact is new", !isNearDuplicate("Boss fights use a state machine per phase", memory));
check("Polish with and without diacritics matches", isNearDuplicate("Zapisy gry trzymamy w chmurze", ["Zapisy gry trzymamy w chmurze."]) && isNearDuplicate("Zapisy gry trzymamy w chmurze", ["zapisy gry trzymamy w chmurze"]));
check("a fact with nothing in it is dropped", isNearDuplicate("This is the task", memory));
const proposed = [
  { type: "constraint", content: "Android builds must stay under 150 MB in total." },
  { type: "fact", content: "Boss fights use one state machine per phase." },
  { type: "fact", content: "Every boss fight uses one state machine per phase." },
];
const kept = newFacts(proposed, memory);
check("only new facts are kept, and not twice", kept.length === 1 && kept[0].content.startsWith("Boss fights"), JSON.stringify(kept));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
