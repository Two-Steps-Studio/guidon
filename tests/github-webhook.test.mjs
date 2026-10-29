#!/usr/bin/env node
import { verifyGithubSignature } from "../src/lib/github/signature.ts";
/**
 * GitHub -> Guidon task rules (src/lib/github/task-refs.ts): which references
 * are recognised and what each event does to the referenced tasks.
 *
 *   npm run test:github
 *
 * task-refs.ts has no imports on purpose, so Node's built-in TypeScript
 * type stripping can load it directly.
 */

import { extractTaskRefs, planPullRequest, planPush, shouldMove, taskRef } from "../src/lib/github/task-refs.ts";
import { distinctiveWords, nextPrState, planPullRequestLinks, planPushLinks, prStateOf, pullRequestTarget, repositoryName, suggestLinks, suggestionText } from "../src/lib/github/link-core.ts";

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

console.log("\n  Webhook signatures");
{
  // Published GitHub test vector, not an application credential.
  const secret = "It's a Secret to Everybody";
  const body = "Hello, World!";
  const signature = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
  check("GitHub's documented signature is valid", verifyGithubSignature(body, signature, secret));
  check("changed body is refused", !verifyGithubSignature(body + "!", signature, secret));
  check("wrong secret is refused", !verifyGithubSignature(body, signature, "wrong"));
  for (const [label, header] of [
    ["missing", null], ["empty", ""], ["short", signature.slice(0, -2)],
    ["non-hex suffix", signature + "garbage"], ["odd hex suffix", signature + "a"],
    ["whitespace suffix", signature + " "], ["newline suffix", signature + "\n"],
    ["wrong algorithm", signature.replace("sha256=", "sha1=")],
  ]) check(`${label} signature is refused`, !verifyGithubSignature(body, header, secret));
}

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
  check("ready_for_review -> review, own key", planPullRequest(pr("ready_for_review", { updated_at: "t1" }), "main").every((a) => a.targetStatus === "review" && a.eventKey === "pr:12:ready:t1"));
  {
    const key = (action, extra) => planPullRequest(pr(action, extra), "main")[0].eventKey;
    check("close, reopen, merge each get their own key", new Set([key("closed", { updated_at: "t1" }), key("reopened", { updated_at: "t2" }), key("closed", { merged: true, updated_at: "t3" })]).size === 3);
    check("redelivery of the same close keeps its key", key("closed", { updated_at: "t1" }) === key("closed", { updated_at: "t1" }));
    check("second close after a reopen is a new event", key("closed", { updated_at: "t1" }) !== key("closed", { updated_at: "t4" }));
    check("merge key is stable", key("closed", { merged: true, updated_at: "a" }) === key("closed", { merged: true, updated_at: "b" }));
  }
  check("merged into default -> done", planPullRequest(pr("closed", { merged: true }), "main").every((a) => a.targetStatus === "done" && a.fromStatuses.includes("review")));
  check("merged elsewhere -> note only", planPullRequest(pr("closed", { merged: true, base: { ref: "develop" } }), "main").every((a) => a.targetStatus === null && a.comment.includes("not the default branch")));
  check("closed unmerged -> note only", planPullRequest(pr("closed"), "main").every((a) => a.targetStatus === null && a.comment.includes("closed without merging")));
  check("edited/synchronize ignored", planPullRequest(pr("edited"), "main").length === 0 && planPullRequest(pr("synchronize"), "main").length === 0);
  check("branch-name ref", eq(planPullRequest(pr("opened", { title: "x", body: null, head: { ref: "guidon-cccccccc" } }), "main").map((a) => a.ref), ["cccccccc"]));
  check("no refs -> nothing", planPullRequest(pr("opened", { title: "x", body: "y" }), "main").length === 0);
  check("malformed payload -> nothing", planPullRequest({ action: "opened" }, "main").length === 0);
}

// Custom columns (migration 060).
{
  const closes = { ref: "x", eventKey: "k", comment: "", targetStatus: "done", fromStatuses: ["backlog", "todo", "in_progress", "ai_working", "review"] };
  const opened = { ref: "x", eventKey: "k", comment: "", targetStatus: "in_progress", fromStatuses: ["backlog", "todo"] };
  check("merge finishes a task waiting in a custom column", shouldMove(closes, "qa", false));
  check("but not one already in a custom done column", !shouldMove(closes, "shipped", true));
  check("an opened PR doesn't pull a task out of a custom column", !shouldMove(opened, "qa", false));
  check("built-in rules unchanged", shouldMove(opened, "todo", false) && !shouldMove(opened, "review", false) && !shouldMove(closes, "done", true));
}

console.log("\n  Smart Linking (migration 097, src/lib/github/link-core.ts)");
{
  const repo = "acme/web";
  const push = planPushLinks({ ref: "refs/heads/guidon-1a2b3c4d-login", commits: [
    { id: "a".repeat(40), message: "Fix redirect guidon#1a2b3c4d\n\nbody", url: `https://github.com/acme/web/commit/${"a".repeat(40)}` },
    { id: "b".repeat(40), message: "Tidy styles", url: "https://evil.example/x" },
    { id: "not-a-sha", message: "guidon#1a2b3c4d" },
  ] }, repo);
  check("a push links the branch and every commit on it", eq(push.map((link) => [link.kind, link.externalRef.slice(0, 7)]), [["branch", "guidon-"], ["commit", "aaaaaaa"], ["commit", "bbbbbbb"]]), JSON.stringify(push));
  check("evidence says why: message vs branch", push[1].evidence.startsWith("Commit message mentions") && push[2].evidence.startsWith("Commit on branch"));
  check("only github.com URLs are kept", push[2].url === null && push[1].url.startsWith("https://github.com/"));
  check("an invalid sha is ignored", !push.some((link) => link.externalRef === "not-a-sha"));
  check("a push without references links nothing", planPushLinks({ ref: "refs/heads/main", commits: [{ id: "c".repeat(40), message: "Refactor login redirect" }] }, repo).length === 0);

  const pr = (action, extra = {}) => ({ action, number: 42, pull_request: { title: "Login redirect guidon#1a2b3c4d", body: "Also guidon#9f8e7d6c", html_url: "https://github.com/acme/web/pull/42", head: { ref: "feature" }, ...extra } });
  const prLinks = planPullRequestLinks(pr("opened"));
  check("a PR links every referenced task once, with where it was mentioned", eq(prLinks.map((link) => [link.ref, link.evidence]), [["1a2b3c4d", "PR title mentions guidon#1a2b3c4d"], ["9f8e7d6c", "PR description mentions guidon#9f8e7d6c"]]));
  check("PR state: open / draft / merged / closed", prStateOf(pr("opened")) === "open" && prStateOf(pr("opened", { draft: true })) === "draft" && prStateOf(pr("closed", { merged: true })) === "merged" && prStateOf(pr("closed")) === "closed");
  check("a lookalike reference is not a link (false positive)", planPullRequestLinks({ action: "opened", number: 1, pull_request: { title: "guidon#1a2b3c4dx and guidon#123 and xguidon#zzzzzzzz" } }).length === 0);
  check("repository names are validated", repositoryName("acme", "web") === "acme/web" && repositoryName("acme", "../etc") === null && repositoryName("", "web") === null);
  check("the PR target carries number, title and state", eq(pullRequestTarget(pr("opened", { title: "T", body: "" })), { kind: "pull_request", externalRef: "42", title: "T", url: "https://github.com/acme/web/pull/42", prState: "open" }));
  check("only opened/reopened/ready PRs suggest", suggestionText(pr("opened")) !== null && suggestionText(pr("closed")) === null && suggestionText(pr("synchronize")) === null);

  const tasks = [
    { id: "t1", title: "Login redirect loops after password reset" },
    { id: "t2", title: "Fix bug" },
    { id: "t3", title: "Dashboard chart colors" },
    { id: "t4", title: "Password reset email template" },
  ];
  const suggestions = suggestLinks("Stop the login redirect loop after a password reset", tasks);
  check("a matching PR suggests the task whose distinctive words it shares", suggestions[0]?.taskId === "t1", JSON.stringify(suggestions));
  check("suggestions are never certain (confidence < 1) and explain themselves", suggestions.every((item) => item.confidence < 1 && item.confidence >= 0.4 && item.evidence.startsWith("Shares")));
  check("generic words never match (false positive: 'Fix bug')", !suggestions.some((item) => item.taskId === "t2") && suggestLinks("Fix bug in update", tasks).length === 0);
  check("one shared word is not enough", suggestLinks("Dashboard performance", tasks).length === 0);
  check("unrelated PRs suggest nothing", suggestLinks("Upgrade Next.js and React", tasks).length === 0);
  check("at most three suggestions", suggestLinks("alpha beta gamma delta", Array.from({ length: 10 }, (_, index) => ({ id: `x${index}`, title: "alpha beta gamma" }))).length === 3);
  check("task references and numbers don't count as words", distinctiveWords("guidon#1a2b3c4d 2026 release fix").size === 0);

  // GitHub doesn't guarantee delivery order.
  check("a late 'opened' never un-merges a PR", nextPrState("merged", "open", "opened") === "merged" && nextPrState("merged", "open", "reopened") === "merged");
  check("a late 'synchronize' doesn't reopen a closed PR", nextPrState("closed", "open", "synchronize") === "closed" && nextPrState("closed", "draft", "converted_to_draft") === "closed");
  check("an explicit 'reopened' does", nextPrState("closed", "open", "reopened") === "open");
  check("open -> merged/closed and draft <-> open follow the event", nextPrState("open", "merged", "closed") === "merged" && nextPrState("open", "closed", "closed") === "closed" && nextPrState("draft", "open", "ready_for_review") === "open" && nextPrState("open", "draft", "converted_to_draft") === "draft");
  check("no state in the event keeps the stored one", nextPrState("open", null, null) === "open" && nextPrState(null, "open", "opened") === "open");
  check("PR links carry the action that produced their state", planPullRequestLinks(pr("reopened", { title: "guidon#1a2b3c4d" }))[0]?.prAction === "reopened");
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
