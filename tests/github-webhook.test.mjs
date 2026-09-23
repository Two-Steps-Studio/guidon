#!/usr/bin/env node
/**
 * GitHub -> Guidon task rules (src/lib/github/task-refs.ts): which references
 * are recognised and what each event does to the referenced tasks.
 *
 *   npm run test:github
 *
 * task-refs.ts has no imports on purpose, so Node's built-in TypeScript
 * type stripping can load it directly.
 */

import { extractTaskRefs, planPullRequest, planPush, taskRef } from "../src/lib/github/task-refs.ts";

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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("\n  extractTaskRefs");
check("short ref", eq(extractTaskRefs("Fix door guidon#1A2b3c4d"), ["1a2b3c4d"]));
check("dash form (branch names)", eq(extractTaskRefs("feature/guidon-1a2b3c4d-door"), ["1a2b3c4d"]));
check("full uuid", eq(extractTaskRefs("guidon#1a2b3c4d-1111-2222-3333-444455556666"), ["1a2b3c4d-1111-2222-3333-444455556666"]));
check("several, deduped", eq(extractTaskRefs("guidon#aaaaaaaa and guidon#bbbbbbbb", "again guidon#AAAAAAAA"), ["aaaaaaaa", "bbbbbbbb"]));
check("too short ignored", eq(extractTaskRefs("guidon#1a2b3c"), []));
check("longer hex word ignored", eq(extractTaskRefs("guidon#1a2b3c4d5e"), []));
check("non-hex ignored", eq(extractTaskRefs("guidon#zzzzzzzz"), []));
check("plain hex ignored", eq(extractTaskRefs("commit 1a2b3c4d"), []));
check("null safe", eq(extractTaskRefs(null, undefined, ""), []));
check("taskRef", taskRef("1A2B3C4D-1111-2222-3333-444455556666") === "guidon#1a2b3c4d");

console.log("\n  planPush");
{
  const actions = planPush({
    ref: "refs/heads/feature/guidon-bbbbbbbb-lift",
    commits: [
      { id: "0123456789abcdef0123456789abcdef01234567", message: "Fix door clip guidon#aaaaaaaa\n\nlong body", url: "https://github.com/o/r/commit/0123456", author: { username: "ala" } },
      { id: "fedcba9876543210fedcba9876543210fedcba98", message: "WIP", url: "https://github.com/o/r/commit/fedcba9" },
      { id: "not-a-sha", message: "guidon#cccccccc" },
    ],
  });
  check("commit ref + branch ref for commit 1, branch ref for commit 2", eq(actions.map((a) => [a.ref, a.eventKey.slice(0, 14)]), [
    ["aaaaaaaa", "commit:0123456"], ["bbbbbbbb", "commit:0123456"], ["bbbbbbbb", "commit:fedcba9"],
  ]), JSON.stringify(actions.map((a) => a.ref)));
  check("moves only unstarted work to in_progress", actions.every((a) => a.targetStatus === "in_progress" && eq(a.fromStatuses, ["backlog", "todo"])));
  check("comment has author, branch, first line, link", actions[0].comment === "Commit 0123456 by ala on feature/guidon-bbbbbbbb-lift: Fix door clip guidon#aaaaaaaa - https://github.com/o/r/commit/0123456", actions[0].comment);
  check("invalid sha skipped", !actions.some((a) => a.ref === "cccccccc"));
}
{
  const [a] = planPush({ ref: "refs/heads/main", commits: [{ id: "0123456789abcdef0123456789abcdef01234567", message: "guidon#aaaaaaaa\u0000tab\there", url: "javascript:alert(1)" }] });
  check("control characters flattened", a.comment.endsWith("guidon#aaaaaaaa tab here"), a.comment);
  check("non-GitHub url not appended", !a.comment.includes("javascript:"), a.comment);
  const [b] = planPush({ ref: "refs/heads/main", commits: [{ id: "0123456789abcdef0123456789abcdef01234567", message: "guidon#aaaaaaaa", url: "https://github.com/o/r/commit/1 https://evil.example" }] });
  check("url with spaces not appended", !b.comment.includes("evil"), b.comment);
}

console.log("\n  planPullRequest");
const pr = (action, extra = {}) => ({
  action,
  number: 12,
  pull_request: { title: "Door fix guidon#aaaaaaaa", body: "Also guidon#bbbbbbbb", html_url: "https://github.com/o/r/pull/12", draft: false, merged: false, head: { ref: "fix/door" }, base: { ref: "main" }, user: { login: "ala" }, ...extra },
});
{
  const opened = planPullRequest(pr("opened"), "main");
  check("opened -> review for title and body refs", eq(opened.map((a) => [a.ref, a.targetStatus]), [["aaaaaaaa", "review"], ["bbbbbbbb", "review"]]));
  check("opened does not reopen done work", !opened[0].fromStatuses.includes("done") && !opened[0].fromStatuses.includes("review"));
  check("opened comment", opened[0].comment === "PR #12 opened by ala: Door fix guidon#aaaaaaaa - https://github.com/o/r/pull/12", opened[0].comment);
  check("draft -> in_progress only", eq(planPullRequest(pr("opened", { draft: true }), "main").map((a) => a.targetStatus), ["in_progress", "in_progress"]));
  check("ready_for_review -> review, own key", planPullRequest(pr("ready_for_review"), "main").every((a) => a.targetStatus === "review" && a.eventKey === "pr:12:ready"));
  check("merged into default -> done", planPullRequest(pr("closed", { merged: true }), "main").every((a) => a.targetStatus === "done" && a.fromStatuses.includes("review")));
  check("merged elsewhere -> note only", planPullRequest(pr("closed", { merged: true, base: { ref: "develop" } }), "main").every((a) => a.targetStatus === null && a.comment.includes("not the default branch")));
  check("closed unmerged -> note only", planPullRequest(pr("closed"), "main").every((a) => a.targetStatus === null && a.comment.includes("closed without merging")));
  check("edited/synchronize ignored", planPullRequest(pr("edited"), "main").length === 0 && planPullRequest(pr("synchronize"), "main").length === 0);
  check("branch-name ref", eq(planPullRequest(pr("opened", { title: "x", body: null, head: { ref: "guidon-cccccccc" } }), "main").map((a) => a.ref), ["cccccccc"]));
  check("no refs -> nothing", planPullRequest(pr("opened", { title: "x", body: "y" }), "main").length === 0);
  check("malformed payload -> nothing", planPullRequest({ action: "opened" }, "main").length === 0);
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
