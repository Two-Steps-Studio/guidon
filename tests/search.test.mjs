// Task search ranking (src/lib/search/task-search-core.ts): normalization,
// task references, typo tolerance, ordering, and 30 realistic queries over a
// 1200-task fixture where the wanted task must be in the top 5.
import assert from "node:assert/strict";
import { editDistance, likePattern, normalizeText, rankTasks, scoreTask, taskRefPrefix } from "../src/lib/search/task-search-core.ts";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  pass  ${name}`); }
  catch (error) { failed++; console.log(`  FAIL  ${name}\n        ${error.message}`); }
}

console.log("\n  Normalization and references");
check("diacritics and case go", () => assert.equal(normalizeText("  Żółty   ŁOSOŚ Überprüfen Mañana "), "zolty losos uberprufen manana"));
check("ß becomes ss", () => assert.equal(normalizeText("Straße"), "strasse"));
check("a short id is a reference", () => assert.equal(taskRefPrefix("b5a350c3"), "b5a350c3"));
check("guidon#ref is a reference", () => assert.equal(taskRefPrefix("guidon#B5A350C3"), "b5a350c3"));
check("a full uuid with dashes is a reference", () => assert.equal(taskRefPrefix("b5a350c3-a08e-4e1c-a221-024b7e24c335"), "b5a350c3a08e4e1ca221024b7e24c335"));
check("hex words without digits are text", () => { assert.equal(taskRefPrefix("facade"), null); assert.equal(taskRefPrefix("decade"), null); });
check("short hex is text", () => assert.equal(taskRefPrefix("b5a3"), null));
check("edit distance counts a swap as one", () => assert.equal(editDistance("lgoin", "login", 2), 1));
check("edit distance gives up past the limit", () => assert.equal(editDistance("abcdef", "uvwxyz", 2), 3));
check("ILIKE wildcards in the query are literal", () => assert.equal(likePattern("50%_off\\"), "%50\\%\\_off\\\\%"));

console.log("\n  Ordering");
const t = (id, title, description = "", minutesAgo = 0) => ({ id, title, description, updated_at: new Date(Date.UTC(2026, 9, 28) - minutesAgo * 60000).toISOString() });
check("exact > prefix > word start > inside a word", () => {
  const ranked = rankTasks("login", [
    t("00000000-0000-4000-8000-000000000004", "Fix the relogin loop"),
    t("00000000-0000-4000-8000-000000000003", "Social login buttons"),
    t("00000000-0000-4000-8000-000000000002", "Login page redesign"),
    t("00000000-0000-4000-8000-000000000001", "Login"),
  ]);
  assert.deepEqual(ranked.map((r) => r.match), ["exact", "prefix", "contains", "contains"]);
  assert.deepEqual(ranked.map((r) => r.task.title), ["Login", "Login page redesign", "Social login buttons", "Fix the relogin loop"]);
});
check("title beats description", () => {
  const ranked = rankTasks("invoice", [t("00000000-0000-4000-8000-000000000001", "Billing", "Send the invoice"), t("00000000-0000-4000-8000-000000000002", "Invoice PDF")]);
  assert.equal(ranked[0].task.title, "Invoice PDF");assert.equal(ranked[1].match, "description");
});
check("equal scores: most recently updated first", () => {
  const ranked = rankTasks("bug", [t("00000000-0000-4000-8000-000000000001", "Bug old", "", 60), t("00000000-0000-4000-8000-000000000002", "Bug new", "", 1)]);
  assert.equal(ranked[0].task.title, "Bug new");
});
check("words in any order", () => assert.equal(scoreTask("page login", t("00000000-0000-4000-8000-000000000001", "Login page redesign")).match, "words"));
check("a typo still finds the task", () => assert.equal(scoreTask("lgoin", t("00000000-0000-4000-8000-000000000001", "Login page redesign")).match, "fuzzy"));
check("unrelated text finds nothing", () => assert.equal(scoreTask("kitchen", t("00000000-0000-4000-8000-000000000001", "Login page redesign")), null));
check("two-letter queries are not fuzzy", () => assert.equal(scoreTask("xq", t("00000000-0000-4000-8000-000000000001", "Login")), null));
check("duplicates are counted once", () => assert.equal(rankTasks("login", [t("00000000-0000-4000-8000-000000000001", "Login"), t("00000000-0000-4000-8000-000000000001", "Login")]).length, 1));

console.log("\n  30 queries over 1200 tasks (the wanted task in the top 5)");
// Deterministic ids and filler: 1200 tasks, 40 of them the real targets.
const hex = (n) => n.toString(16).padStart(8, "0");
const uuid = (n) => `${hex(n)}-0000-4000-8000-${hex(n).padStart(12, "0")}`;
const targets = [
  ["Login page redesign", ""], ["Fix the relogin loop on Safari", ""], ["Żółty przycisk na stronie głównej", ""],
  ["Zadania cykliczne co tydzień", ""], ["Überprüfen der Rechnungen", ""], ["Mañana: preparar la demo", ""],
  ["Export tasks to CSV", "Include comments and labels"], ["Import from Trello", ""], ["Dark mode for the calendar", ""],
  ["Webhook retries after a 500", ""], ["Invite teammates by email", ""], ["Kitchen remodel budget", "Tiles, paint and a plumber"],
  ["Buy paint for the bedroom", ""], ["Onboarding checklist for new hires", ""], ["Quarterly report Q3", ""],
  ["Release notes 2.4", ""], ["Release notes 2.5", ""], ["Mobile quick add button", ""],
  ["Performance budget for the board", ""], ["GitHub pull request linking", ""], ["Password reset email", ""],
  ["Napisać testy dla logowania", ""], ["Spotkanie z klientem w piątek", ""], ["Przygotować fakturę", ""],
  ["Update the privacy policy", "GDPR section"], ["Translate the landing page to Spanish", ""], ["Accessibility audit", ""],
  ["Search results ranking", ""], ["Notification digest", ""], ["Archive old projects", ""],
];
const filler = ["Refactor module", "Update dependency", "Write docs for", "Review PR", "Clean up", "Investigate issue", "Design mockup", "Plan sprint", "Meeting notes", "Small fix in"];
const fixture = [];
let n = 1;
for (const [title, description] of targets) fixture.push({ id: uuid(n++), title, description, updated_at: new Date(Date.UTC(2026, 9, 1) + n * 1000).toISOString() });
while (fixture.length < 1200) {
  const i = fixture.length;
  fixture.push({ id: uuid(n++), title: `${filler[i % filler.length]} area ${i}`, description: `Routine work item ${i}`, updated_at: new Date(Date.UTC(2026, 9, 20) + i * 1000).toISOString() });
}
const id = (title) => fixture.find((task) => task.title === title).id;
const queries = [
  ["login page", "Login page redesign"], ["relogin", "Fix the relogin loop on Safari"], ["zolty przycisk", "Żółty przycisk na stronie głównej"],
  ["zadania cykliczne", "Zadania cykliczne co tydzień"], ["uberprufen", "Überprüfen der Rechnungen"], ["manana demo", "Mañana: preparar la demo"],
  ["export csv", "Export tasks to CSV"], ["comments and labels", "Export tasks to CSV"], ["trelo", "Import from Trello"],
  ["dark mode", "Dark mode for the calendar"], ["webhok retries", "Webhook retries after a 500"], ["invite", "Invite teammates by email"],
  ["plumber", "Kitchen remodel budget"], ["kitchen", "Kitchen remodel budget"], ["paint bedroom", "Buy paint for the bedroom"],
  ["onboardnig", "Onboarding checklist for new hires"], ["q3 report", "Quarterly report Q3"], ["release notes 2.5", "Release notes 2.5"],
  ["quick add", "Mobile quick add button"], ["perfomance budget", "Performance budget for the board"], ["pull request", "GitHub pull request linking"],
  ["pasword reset", "Password reset email"], ["testy logowania", "Napisać testy dla logowania"], ["spotkanie piatek", "Spotkanie z klientem w piątek"],
  ["faktura", "Przygotować fakturę"], ["gdpr", "Update the privacy policy"], ["spanish", "Translate the landing page to Spanish"],
  [`guidon#${id("Accessibility audit").slice(0, 8)}`, "Accessibility audit"], [id("Search results ranking").slice(0, 13), "Search results ranking"], ["digest", "Notification digest"],
];
assert.equal(queries.length, 30);
let hits = 0, firstPlace = 0;
const started = performance.now();
for (const [query, wanted] of queries) {
  const top = rankTasks(query, fixture, 5).map((r) => r.task.title);
  const position = top.indexOf(wanted);
  if (position >= 0) hits++;
  if (position === 0) firstPlace++;
  check(`"${query}" -> ${wanted}${position > 0 ? ` (#${position + 1})` : ""}`, () => assert.ok(position >= 0, `top 5: ${JSON.stringify(top)}`));
}
const perQuery = (performance.now() - started) / queries.length;
console.log(`\n  wanted task in top 5: ${hits}/30, first: ${firstPlace}/30, ${perQuery.toFixed(1)} ms per query over ${fixture.length} tasks`);
check("ranking 1200 tasks stays well under the 500 ms search budget", () => assert.ok(perQuery < 100, `${perQuery} ms`));

console.log(`\n  ${passed} pass / ${failed} fail\n`);
if (failed) process.exit(1);
