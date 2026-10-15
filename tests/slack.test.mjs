#!/usr/bin/env node
/**
 * The Slack integration's pure parts: request signature (src/lib/slack/signature.ts),
 * the channel link token (link-token.ts) and the /guidon command text
 * handling (commands.ts).
 *
 *   npm run test:slack
 */

import { createHmac } from "node:crypto";
import { verifySlackSignature, SLACK_MAX_AGE_SECONDS } from "../src/lib/slack/signature.ts";
import { createSlackLinkToken, verifySlackLinkToken, SLACK_LINK_TTL_SECONDS } from "../src/lib/slack/link-token.ts";
import {
  COMMENT_MAX_LENGTH,
  DEFAULT_LIST_STATUSES,
  LIST_LIMIT,
  escapeMrkdwn,
  formatTaskList,
  gitRef,
  parseSlackCommand,
  resolveTaskRef,
  unescapeSlackText,
} from "../src/lib/slack/commands.ts";

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
const section = (title) => console.log(`\n${title}`);

// --- signature -------------------------------------------------------------
section("1. Slack request signature");
const secret = "8f742231b10e8888abcd99yyyzzz85a5";
const body = "token=x&team_id=T1&channel_id=C1&text=list";
const now = 1_700_000_000;
const sign = (ts, raw = body, key = secret) => "v0=" + createHmac("sha256", key).update(`v0:${ts}:${raw}`).digest("hex");
const verify = (overrides = {}) =>
  verifySlackSignature({ rawBody: body, timestamp: String(now), signature: sign(now), signingSecret: secret, nowSeconds: now, ...overrides });

check("valid signature", verify());
check("tampered body refused", !verify({ rawBody: body + "&text=done" }));
check("other secret refused", !verify({ signature: sign(now, body, "other") }));
check("stale timestamp refused", !verify({ nowSeconds: now + SLACK_MAX_AGE_SECONDS + 1 }));
check("future timestamp refused", !verify({ nowSeconds: now - SLACK_MAX_AGE_SECONDS - 1 }));
check("within the window accepted", verify({ nowSeconds: now + SLACK_MAX_AGE_SECONDS }));
check("missing signature refused", !verify({ signature: null }));
check("missing timestamp refused", !verify({ timestamp: null }));
check("non-numeric timestamp refused", !verify({ timestamp: "12abc" }));
check("empty secret refused", !verify({ signingSecret: "" }));
check("truncated signature refused", !verify({ signature: sign(now).slice(0, 20) }));

// --- link token ------------------------------------------------------------
section("2. Channel link token");
const channel = { teamId: "T0001", teamName: "acme", channelId: "C0001", channelName: "space-game" };
const token = createSlackLinkToken(channel, "auth-secret", now);
const back = verifySlackLinkToken(token, "auth-secret", now);
check("round trip", back && Object.keys(channel).every((key) => back[key] === channel[key]), JSON.stringify(back));
check("valid until the TTL", verifySlackLinkToken(token, "auth-secret", now + SLACK_LINK_TTL_SECONDS) !== null);
check("expired after the TTL", verifySlackLinkToken(token, "auth-secret", now + SLACK_LINK_TTL_SECONDS + 1) === null);
check("other secret refused", verifySlackLinkToken(token, "other-secret", now) === null);
check("empty secret refused", verifySlackLinkToken(token, "", now) === null);
check("garbage refused", verifySlackLinkToken("abc.def", "auth-secret", now) === null);
check("missing token refused", verifySlackLinkToken(undefined, "auth-secret", now) === null);
// A token with another purpose (e.g. the Discord guild link) signed with the same secret.
const foreignPayload = Buffer.from(JSON.stringify({ typ: "guild-link", teamId: "T1", channelId: "C1", exp: now + 60 })).toString("base64url");
const foreign = `${foreignPayload}.${createHmac("sha256", "auth-secret").update(foreignPayload).digest("base64url")}`;
check("other purpose refused", verifySlackLinkToken(foreign, "auth-secret", now) === null);
const [payloadB64, sig] = token.split(".");
const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payloadB64, "base64url").toString()), channelId: "C9999" })).toString("base64url");
check("altered payload refused", verifySlackLinkToken(`${altered}.${sig}`, "auth-secret", now) === null);

// --- command parsing --------------------------------------------------------
section("3. /guidon command text");
const p = parseSlackCommand;
check("empty -> help", p("").kind === "help");
check("help", p("  HELP ").kind === "help");
check("link", p("link").kind === "link");
check("list default statuses", p("list").kind === "list" && p("list").statuses === DEFAULT_LIST_STATUSES);
check("list all", p("list all").statuses === "all");
check("list done", JSON.stringify(p("list Done").statuses) === '["done"]');
check("list in-progress alias", JSON.stringify(p("list in-progress").statuses) === '["in_progress"]');
check("list unknown status -> usage", p("list later").kind === "usage");
check("start", p("start guidon#1a2b3c4d").kind === "start" && p("start guidon#1a2b3c4d").ref === "guidon#1a2b3c4d");
check("done", p("done 1a2b3c4d").kind === "done");
check("complete -> done", p("complete 1a2b3c4d").kind === "done");
check("start without task -> usage", p("start").kind === "usage");
const c = p("comment guidon#1a2b3c4d  Fixed in  build 42\nsee log");
check("comment keeps its text", c.kind === "comment" && c.ref === "guidon#1a2b3c4d" && c.text === "Fixed in  build 42\nsee log", JSON.stringify(c));
check("comment without text -> usage", p("comment guidon#1a2b3c4d").kind === "usage");
check("comment too long -> usage", p(`comment abcdef ${"x".repeat(COMMENT_MAX_LENGTH + 1)}`).kind === "usage");
check("unknown word", p("deploy now").kind === "unknown" && p("deploy now").word === "deploy");
check("Slack entities unescaped in comments", p("comment abcdef a &lt;b&gt; &amp; c").text === "a <b> & c");

section("4. Slack text and formatting");
check("mention markup -> name", unescapeSlackText("thanks <@U123|marta>") === "thanks marta");
check("link markup -> text (url)", unescapeSlackText("see <https://x.dev/a|the docs>") === "see the docs (https://x.dev/a)");
check("bare link markup -> url", unescapeSlackText("<https://x.dev>") === "https://x.dev");
check("escapeMrkdwn", escapeMrkdwn("a<b>&c") === "a&lt;b&gt;&amp;c");
check("gitRef", gitRef("1A2B3C4D-0000-4000-8000-000000000000") === "guidon#1a2b3c4d");
const tasks = Array.from({ length: LIST_LIMIT + 3 }, (_, i) => ({
  id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
  title: i === 0 ? "<script>&" : `Task ${i}`,
  status: "todo",
  priority: "high",
}));
const text = formatTaskList(tasks, (s) => (s === "todo" ? "To Do" : s), (id) => `https://g.test/t/${id}`);
check("list capped with a tail", text.split("\n").length === LIST_LIMIT + 1 && text.endsWith("...and 3 more."), text.split("\n").length);
check("titles escaped", text.includes("&lt;script&gt;&amp;") && !text.includes("<script>"));
check("lines carry ref, link, column label", text.startsWith("`guidon#00000000` <https://g.test/t/00000000-0000-4000-8000-000000000000|") && text.includes("- To Do (high)"));
check("empty list", formatTaskList([], (s) => s, () => "") === "No tasks here.");

section("5. Task references");
const board = [
  { id: "1a2b3c4d-0000-4000-8000-000000000001" },
  { id: "1a2b3c4e-0000-4000-8000-000000000002" },
  { id: "ffffffff-0000-4000-8000-000000000003" },
];
check("guidon# prefix", resolveTaskRef("guidon#1a2b3c4d", board).task?.id === board[0].id);
check("bare prefix, case-insensitive", resolveTaskRef("FFFFFFFF", board).task?.id === board[2].id);
check("full id", resolveTaskRef(board[1].id, board).task?.id === board[1].id);
check("ambiguous prefix", resolveTaskRef("1a2b3c", board).error === "ambiguous");
check("not found", resolveTaskRef("abcdef12", board).error === "not_found");
check("too short", resolveTaskRef("1a2b", board).error === "invalid");
check("not hex", resolveTaskRef("hello-world", board).error === "invalid");

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
