/**
 * What every /api/v1 response shares (src/lib/api/api-route-core.ts) and
 * POST /api/v1/batch's parsing and routing (src/lib/api/batch-core.ts).
 * Both files have no imports, so Node's built-in type stripping runs them.
 */
import { AGENT_GATE_ERRORS, AGENT_PERMISSION_DEFAULTS, agentDecision } from "../src/lib/api/agent-gate-core.ts";
import {
  decodeCursor,
  encodeCursor,
  enrichErrorBody,
  errorCodeFor,
  isValidIdempotencyKey,
  parseLimit,
  rateLimitHeaders,
  toPage,
} from "../src/lib/api/api-route-core.ts";
import { MAX_BATCH_OPERATIONS, matchBatchRoute, parseBatch } from "../src/lib/api/batch-core.ts";

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
function section(title) {
  console.log(`\n  ${title}`);
}

const DOCS = "https://useguidon.com/developers#errors";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

section("error bodies");
const notFound = enrichErrorBody({ error: "Task not found." }, 404, DOCS);
check("404 gets code not_found", notFound.code === "not_found");
check("...a hint and the docs link", typeof notFound.hint === "string" && notFound.docs === DOCS);
check("the message stays", notFound.error === "Task not found.");
check("a route's own code wins", enrichErrorBody({ error: "x", code: "idempotency_key_reused" }, 422, DOCS).code === "idempotency_key_reused");
check("success bodies untouched", enrichErrorBody({ task: {} }, 200, DOCS).code === undefined);
check("non-error JSON untouched", JSON.stringify(enrichErrorBody([1, 2], 400, DOCS)) === "[1,2]");
check("bodies without error untouched", enrichErrorBody({ message: "x" }, 400, DOCS).code === undefined);
check("429 -> rate_limited", errorCodeFor(429) === "rate_limited");
check("unknown 5xx -> internal_error", errorCodeFor(502) === "internal_error");
check("unknown 4xx -> invalid_request", errorCodeFor(418) === "invalid_request");

section("rate-limit headers");
const headers = rateLimitHeaders({ limit: 60, remaining: 12, resetSeconds: 30.2 }, 60);
check("RateLimit-Limit/Remaining/Reset", headers["RateLimit-Limit"] === "60" && headers["RateLimit-Remaining"] === "12" && headers["RateLimit-Reset"] === "31");
check("draft structured fields", headers.RateLimit === '"default";r=12;t=31' && headers["RateLimit-Policy"] === '"default";q=60;w=60');
check("never negative", rateLimitHeaders({ limit: 60, remaining: -3, resetSeconds: -1 }, 60)["RateLimit-Remaining"] === "0");

section("Idempotency-Key");
check("a UUID is valid", isValidIdempotencyKey(ID));
check("empty is not", !isValidIdempotencyKey(""));
check("spaces are not", !isValidIdempotencyKey("a b"));
check("256 characters is too long", !isValidIdempotencyKey("a".repeat(256)));
check("non-ASCII is not", !isValidIdempotencyKey("zażółć"));

section("cursors and pages");
const cursor = encodeCursor({ id: ID, createdAt: "2026-10-21T01:02:03.123Z" });
check("cursor is URL-safe", /^[A-Za-z0-9_-]+$/.test(cursor), cursor);
const decoded = decodeCursor(cursor);
check("cursor round-trips", decoded?.id === ID && decoded.createdAt === "2026-10-21T01:02:03.123Z");
check("garbage cursor -> null", decodeCursor("zzz") === null);
check("cursor with a bad id -> null", decodeCursor(Buffer.from("x|2026-01-01T00:00:00Z").toString("base64url")) === null);
const rows = [3, 2, 1].map((n) => ({ id: ID.replace(/.$/, String(n)), created_at: new Date(Date.UTC(2026, 0, n)) }));
const page = toPage(rows, 2);
check("page holds limit rows", page.items.length === 2);
check("next cursor points at the last row of the page", decodeCursor(page.nextCursor)?.id === rows[1].id);
check("Date created_at is encoded as ISO", decodeCursor(page.nextCursor)?.createdAt === "2026-01-02T00:00:00.000Z");
check("last page -> next cursor null", toPage(rows, 3).nextCursor === null);
check("limit default", parseLimit(null, 1000, 1000) === 1000);
check("limit clamped high", parseLimit("5000", 1000, 1000) === 1000);
check("limit clamped low", parseLimit("0", 1000, 1000) === 1);
check("limit not a number -> default", parseLimit("abc", 50, 100) === 50);

section("batch");
const ok = parseBatch({ operations: [{ method: "get", path: "/projects" }, { method: "PATCH", path: `/tasks/${ID}/status`, body: { status: "review" } }] });
check("valid batch parses, methods upper-cased", !("error" in ok) && ok.operations[0].method === "GET" && ok.operations[1].body.status === "review");
check("missing operations rejected", "error" in parseBatch({}));
check("empty rejected", "error" in parseBatch({ operations: [] }));
check(`more than ${MAX_BATCH_OPERATIONS} rejected`, "error" in parseBatch({ operations: Array.from({ length: MAX_BATCH_OPERATIONS + 1 }, () => ({ method: "GET", path: "/projects" })) }));
check("PUT rejected", "error" in parseBatch({ operations: [{ method: "PUT", path: "/projects" }] }));
check("relative path rejected", "error" in parseBatch({ operations: [{ method: "GET", path: "projects" }] }));
check("path traversal rejected", "error" in parseBatch({ operations: [{ method: "GET", path: "/tasks/../admin" }] }));
check("nested batch rejected", "error" in parseBatch({ operations: [{ method: "POST", path: "/batch" }] }));
check("/projects routes", matchBatchRoute("/projects")?.key === "projects");
check("tasks of a project", matchBatchRoute(`/projects/${ID}/tasks?limit=5`)?.params.projectId === ID);
check("columns are not a knowledge collection", matchBatchRoute(`/projects/${ID}/columns`)?.key === "projectColumns");
check("knowledge item", matchBatchRoute(`/projects/${ID}/decisions/${ID}`)?.params.resource === "decisions");
check("task action", matchBatchRoute(`/tasks/${ID}/status`)?.params.action === "status");
check("unknown task action", matchBatchRoute(`/tasks/${ID}/delete-everything`) === null);
check("non-uuid id", matchBatchRoute("/tasks/abc") === null);

section("AI permissions (Settings -> AI Permissions)");
const decide = (over) => agentDecision({ humanClient: false, aiEnabled: true, permissions: null, permission: "can_read_context", ...over });
check("an agent reads context by default", decide({}) === "allowed");
check("turning reading off blocks it", decide({ permissions: { can_read_context: false } }) === "not_permitted");
check("deleting is off by default", decide({ permission: "can_delete_tasks" }) === "not_permitted");
check("a refused delete points the agent to asking for approval", AGENT_GATE_ERRORS.not_permitted("can_delete_tasks").includes("approval-requests") && !AGENT_GATE_ERRORS.not_permitted("can_read_context").includes("approval"));
check("an admin can allow deleting", decide({ permission: "can_delete_tasks", permissions: { can_delete_tasks: true } }) === "allowed");
check("settings changes are off by default", decide({ permission: "can_modify_settings" }) === "not_permitted");
check("AI turned off for the project wins over every permission", decide({ aiEnabled: false, permissions: { can_read_context: true } }) === "ai_disabled");
check("an unreadable project row leaves the answer to RLS", decide({ aiEnabled: null }) === "allowed");
check("a human-operated client (Unity plugin) is not an agent", decide({ humanClient: true, aiEnabled: false, permission: "can_delete_tasks" }) === "allowed");
check("defaults match migration 016", JSON.stringify(AGENT_PERMISSION_DEFAULTS) === JSON.stringify({ can_read_context: true, can_create_comments: true, can_change_status: true, can_complete_tasks: false, can_modify_settings: false, can_delete_tasks: false }));

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
