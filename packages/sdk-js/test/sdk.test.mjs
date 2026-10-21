import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Guidon, GuidonError, normalizeBaseUrl, isGuidonError } from "../dist/index.js";
import { startMockServer } from "./mock-server.mjs";

const KEY = "guidon_test_key";
const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const task = (over = {}) => ({
  id: T,
  project_id: P,
  parent_task_id: null,
  title: "Fix the jump",
  description: null,
  status: "backlog",
  priority: "medium",
  tags: [],
  assignee_id: null,
  due_date: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

let server;
let client;
before(async () => {
  server = await startMockServer();
  client = new Guidon({ apiKey: KEY, baseUrl: server.url, maxRetries: 2 });
});
after(() => server.close());
beforeEach(() => {
  server.requests.length = 0;
  for (const key of Object.keys(server.routes)) delete server.routes[key];
});
const last = () => server.requests.at(-1);

describe("configuration", () => {
  test("normalizes base URLs", () => {
    assert.equal(normalizeBaseUrl("https://useguidon.com"), "https://useguidon.com/api/v1");
    assert.equal(normalizeBaseUrl("https://useguidon.com/"), "https://useguidon.com/api/v1");
    assert.equal(normalizeBaseUrl("https://useguidon.com/api/v1/"), "https://useguidon.com/api/v1");
    assert.equal(normalizeBaseUrl("https://x.example/guidon"), "https://x.example/guidon/api/v1");
    assert.throws(() => normalizeBaseUrl("ftp://x"), (e) => e instanceof GuidonError && e.code === "invalid_base_url");
    assert.throws(() => normalizeBaseUrl("not a url"), GuidonError);
  });

  test("defaults to useguidon.com", () => {
    const saved = process.env.GUIDON_BASE_URL;
    delete process.env.GUIDON_BASE_URL;
    try {
      assert.equal(new Guidon({ apiKey: KEY }).baseUrl, "https://useguidon.com/api/v1");
    } finally {
      if (saved !== undefined) process.env.GUIDON_BASE_URL = saved;
    }
  });

  test("requires an API key, falling back to GUIDON_API_KEY", () => {
    const saved = process.env.GUIDON_API_KEY;
    delete process.env.GUIDON_API_KEY;
    try {
      assert.throws(() => new Guidon(), (e) => e instanceof GuidonError && e.code === "missing_api_key");
      process.env.GUIDON_API_KEY = "guidon_from_env";
      assert.ok(new Guidon());
    } finally {
      if (saved === undefined) delete process.env.GUIDON_API_KEY;
      else process.env.GUIDON_API_KEY = saved;
    }
  });
});

describe("request shapes", () => {
  test("projects.list sends auth, accept and user-agent headers", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ body: { projects: [{ id: P, name: "Game", organization_id: "o" }] } });
    const projects = await client.projects.list();
    assert.deepEqual(projects, [{ id: P, name: "Game", organization_id: "o" }]);
    const req = last();
    assert.equal(req.headers.authorization, `Bearer ${KEY}`);
    assert.equal(req.headers.accept, "application/json");
    assert.match(req.headers["user-agent"], /^guidon-sdk-js\/\d+\.\d+\.\d+/);
    assert.equal(req.headers["idempotency-key"], undefined);
  });

  test("project board configuration endpoints", async () => {
    server.routes[`GET /api/v1/projects/${P}/columns`] = () => ({ body: { columns: [{ status: "todo", label: "To do" }] } });
    server.routes[`GET /api/v1/projects/${P}/priorities`] = () => ({ body: { priorities: [{ key: "high" }] } });
    server.routes[`GET /api/v1/projects/${P}/references`] = () => ({ body: { references: [] } });
    assert.equal((await client.projects.columns(P))[0].status, "todo");
    assert.equal((await client.projects.priorities(P))[0].key, "high");
    assert.deepEqual(await client.projects.references(P), []);
  });

  test("tasks.list filters by status and parent client-side", async () => {
    server.routes[`GET /api/v1/projects/${P}/tasks`] = () => ({
      body: {
        tasks: [
          task({ id: "a", status: "todo" }),
          task({ id: "b", status: "done" }),
          task({ id: "c", status: "todo", parent_task_id: "a" }),
        ],
      },
    });
    assert.equal((await client.tasks.list(P)).length, 3);
    assert.deepEqual((await client.tasks.list(P, { status: "todo" })).map((t) => t.id), ["a", "c"]);
    assert.deepEqual((await client.tasks.list(P, { status: ["todo", "done"], parentTaskId: null })).map((t) => t.id), ["a", "b"]);
    assert.deepEqual((await client.subtasks.list(P, "a")).map((t) => t.id), ["c"]);
  });

  test("tasks.listPage / iterate / list follow next_cursor", async () => {
    const pages = { "": [["a", "b"], "c1"], c1: [["c"], "c2"], c2: [["d"], null] };
    server.routes[`GET /api/v1/projects/${P}/tasks`] = (req) => {
      const [ids, next] = pages[req.query.cursor ?? ""];
      return { body: { tasks: ids.map((id) => task({ id })), next_cursor: next } };
    };
    const first = await client.tasks.listPage(P, { limit: 2 });
    assert.deepEqual(first.tasks.map((t) => t.id), ["a", "b"]);
    assert.equal(first.nextCursor, "c1");
    assert.deepEqual(last().query, { limit: "2" });
    const second = await client.tasks.listPage(P, { cursor: "c1" });
    assert.deepEqual(last().query, { cursor: "c1" });
    assert.equal(second.nextCursor, "c2");

    server.requests.length = 0;
    const all = [];
    for await (const t of client.tasks.iterate(P, { pageSize: 2 })) all.push(t.id);
    assert.deepEqual(all, ["a", "b", "c", "d"]);
    assert.equal(server.requests.length, 3);
    assert.deepEqual(server.requests.map((r) => r.query.limit), ["2", "2", "2"]);

    assert.deepEqual((await client.tasks.list(P)).map((t) => t.id), ["a", "b", "c", "d"]);
  });

  test("a server without pagination (no next_cursor) is one page", async () => {
    server.routes[`GET /api/v1/projects/${P}/tasks`] = () => ({ body: { tasks: [task()] } });
    assert.deepEqual(await client.tasks.listPage(P), { tasks: [task()], nextCursor: null });
    assert.equal((await client.tasks.list(P)).length, 1);
  });

  test("a repeated cursor stops paging", async () => {
    server.routes[`GET /api/v1/projects/${P}/tasks`] = () => ({ body: { tasks: [task()], next_cursor: "same" } });
    assert.equal((await client.tasks.list(P)).length, 2);
    assert.equal(server.requests.length, 2);
  });

  test("tasks.create posts JSON and sends Idempotency-Key", async () => {
    server.routes[`POST /api/v1/projects/${P}/tasks`] = (req) => ({ body: { task: task({ title: req.body.title, priority: req.body.priority }) } });
    const created = await client.tasks.create(P, { title: "Fix the jump", priority: "high" }, { idempotencyKey: "idem-1" });
    assert.equal(created.title, "Fix the jump");
    const req = last();
    assert.equal(req.method, "POST");
    assert.equal(req.headers["content-type"], "application/json");
    assert.equal(req.headers["idempotency-key"], "idem-1");
    assert.deepEqual(req.body, { title: "Fix the jump", priority: "high" });
  });

  test("subtasks.create sets parent_task_id", async () => {
    server.routes[`POST /api/v1/projects/${P}/tasks`] = (req) => ({ body: { task: task({ parent_task_id: req.body.parent_task_id, status: "todo" }) } });
    const sub = await client.subtasks.create(P, T, { title: "Step 1" });
    assert.equal(sub.parent_task_id, T);
    assert.deepEqual(last().body, { title: "Step 1", parent_task_id: T });
  });

  test("tasks.get / update / move / start / complete / delete / context", async () => {
    server.routes[`GET /api/v1/tasks/${T}`] = () => ({ body: { task: task() } });
    server.routes[`PATCH /api/v1/tasks/${T}`] = (req) => ({ body: { task: task(req.body) } });
    server.routes[`PATCH /api/v1/tasks/${T}/status`] = (req) => ({ body: { task: task({ status: req.body.status }) } });
    server.routes[`POST /api/v1/tasks/${T}/start`] = () => ({ body: { task: task({ status: "ai_working" }) } });
    server.routes[`POST /api/v1/tasks/${T}/complete`] = () => ({ body: { task: task({ status: "done" }) } });
    server.routes[`DELETE /api/v1/tasks/${T}`] = () => ({ body: { ok: true } });
    server.routes[`GET /api/v1/tasks/${T}/context`] = () => ({ raw: "# Fix the jump\n", headers: { "content-type": "text/markdown" } });

    assert.equal((await client.tasks.get(T)).id, T);

    const updated = await client.tasks.update(T, { description: null, sort_order: 3 }, { idempotencyKey: "u1" });
    assert.equal(updated.sort_order, 3);
    assert.deepEqual(last().body, { description: null, sort_order: 3 });
    assert.equal(last().method, "PATCH");

    assert.equal((await client.tasks.move(T, "review")).status, "review");
    assert.deepEqual(last().body, { status: "review" });

    assert.equal((await client.tasks.start(T)).status, "ai_working");
    assert.equal(last().rawBody.length, 0);
    assert.equal((await client.tasks.complete(T)).status, "done");
    assert.equal(await client.tasks.delete(T, { idempotencyKey: "d1" }), undefined);
    assert.equal(last().method, "DELETE");
    assert.equal(last().headers["idempotency-key"], "d1");

    assert.equal(await client.tasks.context(T), "# Fix the jump\n");
    assert.match(last().headers.accept, /text\/markdown/);
  });

  test("path segments are URL-encoded", async () => {
    server.routes["*"] = (req) => ({ body: { task: task({ id: req.path }) } });
    const t = await client.tasks.get("a/b?c");
    assert.equal(t.id, "/api/v1/tasks/a%2Fb%3Fc");
    await assert.rejects(() => client.tasks.get(""), TypeError);
  });

  test("comments and attempts", async () => {
    server.routes[`GET /api/v1/tasks/${T}/comment`] = () => ({ body: { comments: [{ id: "c1", content: "hi" }] } });
    server.routes[`POST /api/v1/tasks/${T}/comment`] = (req) => ({ body: { comment: { id: "c2", content: req.body.content } } });
    server.routes[`GET /api/v1/tasks/${T}/attempts`] = () => ({ body: { attempts: [] } });
    server.routes[`POST /api/v1/tasks/${T}/attempts`] = (req) => ({ status: 201, body: { attempt: { id: "a1", ...req.body } } });

    assert.equal((await client.comments.list(T))[0].content, "hi");
    const c = await client.comments.create(T, "Looks good", { idempotencyKey: "c-1" });
    assert.equal(c.content, "Looks good");
    assert.deepEqual(last().body, { content: "Looks good" });
    assert.equal(last().headers["idempotency-key"], "c-1");

    assert.deepEqual(await client.attempts.list(T), []);
    const a = await client.attempts.record(T, { problem: "p", approach: "a", outcome: "failed", files_changed: ["x.ts"] });
    assert.equal(a.outcome, "failed");
    assert.deepEqual(last().body, { problem: "p", approach: "a", outcome: "failed", files_changed: ["x.ts"] });
  });

  test("project knowledge collections use their list/item keys", async () => {
    const cases = [
      ["decisions", "decisions", "decision"],
      ["knowledge", "sources", "source"],
      ["roadmap", "phases", "phase"],
      ["memory", "memories", "memory"],
      ["technologies", "technologies", "technology"],
    ];
    const prop = { decisions: "decisions", knowledge: "knowledge", roadmap: "roadmap", memory: "memory", technologies: "technologies" };
    for (const [path, listKey, itemKey] of cases) {
      const base = `/api/v1/projects/${P}/${path}`;
      server.routes[`GET ${base}`] = () => ({ body: { [listKey]: [{ id: "i1" }] } });
      server.routes[`POST ${base}`] = (req) => ({ status: 201, body: { [itemKey]: { id: "i2", ...req.body } } });
      server.routes[`GET ${base}/i1`] = () => ({ body: { [itemKey]: { id: "i1" } } });
      server.routes[`PATCH ${base}/i1`] = (req) => ({ body: { [itemKey]: { id: "i1", ...req.body } } });
      server.routes[`DELETE ${base}/i1`] = () => ({ body: { ok: true } });
      const col = client[prop[path]];
      assert.deepEqual(await col.list(P), [{ id: "i1" }], path);
      assert.equal((await col.get(P, "i1")).id, "i1", path);
      assert.equal((await col.create(P, { title: "t", name: "n", content: "c" })).id, "i2", path);
      assert.equal((await col.update(P, "i1", { status: "x" })).status, "x", path);
      assert.equal(await col.delete(P, "i1"), undefined, path);
    }
  });

  test("reports.file sends multipart with content-length", async () => {
    server.routes[`POST /api/v1/projects/${P}/reports`] = () => ({ status: 201, body: { task: task(), attachments: [{ id: "f" }], warnings: [] } });
    const res = await client.reports.file(P, {
      title: "Crash on load",
      category: "crash",
      metadata: { version: "1.2.0" },
      files: [{ name: "log.txt", data: "boom", type: "text/plain" }],
    });
    assert.equal(res.attachments.length, 1);
    const req = last();
    assert.match(req.headers["content-type"], /^multipart\/form-data; boundary=/);
    assert.ok(Number(req.headers["content-length"]) > 0, "content-length is set (the route requires it)");
    const text = req.rawBody.toString("utf8");
    assert.match(text, /name="title"\r\n\r\nCrash on load/);
    assert.match(text, /name="metadata"\r\n\r\n\{"version":"1.2.0"\}/);
    assert.match(text, /name="file"; filename="log.txt"/);
    assert.match(text, /boom/);
  });

  test("request() escape hatch with query parameters", async () => {
    server.routes["GET /api/v1/anything"] = (req) => ({ body: { q: req.query } });
    const res = await client.request("GET", "/anything", { query: { a: 1, b: undefined, c: true } });
    assert.deepEqual(res, { q: { a: "1", c: "true" } });
  });
});

describe("errors", () => {
  test("parses { error } bodies into GuidonError", async () => {
    server.routes[`GET /api/v1/tasks/${T}`] = () => ({ status: 404, body: { error: "Task not found." }, headers: { "x-request-id": "req-9" } });
    await assert.rejects(client.tasks.get(T), (e) => {
      assert.ok(isGuidonError(e));
      assert.equal(e.name, "GuidonError");
      assert.equal(e.status, 404);
      assert.equal(e.code, "not_found");
      assert.equal(e.message, "Task not found.");
      assert.deepEqual(e.body, { error: "Task not found." });
      assert.equal(e.requestId, "req-9");
      assert.equal(e.method, "GET");
      return true;
    });
  });

  test("maps statuses to codes and prefers a server-sent code", async () => {
    for (const [status, code] of [[400, "invalid_request"], [401, "unauthorized"], [403, "forbidden"], [422, "unprocessable"], [500, "internal_error"], [502, "internal_error"], [418, "invalid_request"]]) {
      server.routes["GET /api/v1/projects"] = () => ({ status, body: { error: `e${status}` } });
      await assert.rejects(client.projects.list(), (e) => e.status === status && e.code === code && e.message === `e${status}`);
    }
    server.routes["GET /api/v1/projects"] = () => ({ status: 409, body: { error: "Replay", code: "idempotency_conflict" } });
    await assert.rejects(client.projects.list(), (e) => e.code === "idempotency_conflict");
  });

  test("exposes the server's hint and docs", async () => {
    server.routes["GET /api/v1/projects"] = () => ({
      status: 401,
      body: { error: "Invalid or missing API key.", code: "unauthorized", hint: "Send a valid API key.", docs: "https://useguidon.com/developers" },
    });
    await assert.rejects(client.projects.list(), (e) => e.hint === "Send a valid API key." && e.docs === "https://useguidon.com/developers");
  });

  test("non-JSON error bodies keep the text", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ status: 400, raw: "<html>bad</html>", headers: { "content-type": "text/html" } });
    await assert.rejects(client.projects.list(), (e) => e.status === 400 && e.body === "<html>bad</html>" && /HTTP 400/.test(e.message));
  });

  test("a non-JSON success body is invalid_response", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ raw: "<html>login</html>", headers: { "content-type": "text/html" } });
    await assert.rejects(client.projects.list(), (e) => e.code === "invalid_response" && e.status === 200);
  });

  test("network errors", async () => {
    const dead = new Guidon({ apiKey: KEY, baseUrl: "http://127.0.0.1:1", maxRetries: 0 });
    await assert.rejects(dead.projects.list(), (e) => e instanceof GuidonError && e.status === 0 && e.code === "network_error");
  });

  test("timeouts", async () => {
    server.routes["GET /api/v1/projects"] = () => new Promise((r) => setTimeout(() => r({ body: { projects: [] } }), 300));
    const slow = new Guidon({ apiKey: KEY, baseUrl: server.url, timeoutMs: 50, maxRetries: 0 });
    await assert.rejects(slow.projects.list(), (e) => e.code === "timeout");
  });

  test("caller abort", async () => {
    server.routes["GET /api/v1/projects"] = () => new Promise((r) => setTimeout(() => r({ body: { projects: [] } }), 300));
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 20);
    await assert.rejects(client.projects.list({ signal: ac.signal }), (e) => e.code === "aborted");
  });
});

describe("retries", () => {
  test("GET retries 429 honouring Retry-After", async () => {
    server.routes["GET /api/v1/projects"] = (_req, all) =>
      all.length < 3 ? { status: 429, body: { error: "Rate limit exceeded." }, headers: { "retry-after": "0" } } : { body: { projects: [] } };
    assert.deepEqual(await client.projects.list(), []);
    assert.equal(server.requests.length, 3);
  });

  test("gives up after maxRetries", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ status: 503, body: { error: "down" }, headers: { "retry-after": "0" } });
    await assert.rejects(client.projects.list(), (e) => e.status === 503 && e.retryAfter === 0);
    assert.equal(server.requests.length, 3);
  });

  test("writes without an idempotency key are not retried", async () => {
    server.routes[`POST /api/v1/projects/${P}/tasks`] = () => ({ status: 503, body: { error: "down" }, headers: { "retry-after": "0" } });
    await assert.rejects(client.tasks.create(P, { title: "x" }), (e) => e.status === 503);
    assert.equal(server.requests.length, 1);
  });

  test("writes with an idempotency key are retried with the same key", async () => {
    server.routes[`POST /api/v1/projects/${P}/tasks`] = (_req, all) =>
      all.length < 2 ? { status: 502, body: { error: "bad gateway" }, headers: { "retry-after": "0" } } : { body: { task: task() } };
    await client.tasks.create(P, { title: "x" }, { idempotencyKey: "same" });
    assert.equal(server.requests.length, 2);
    assert.deepEqual(server.requests.map((r) => r.headers["idempotency-key"]), ["same", "same"]);
  });

  test("409 idempotency_in_progress is retried for keyed writes", async () => {
    server.routes[`POST /api/v1/tasks/${T}/comment`] = (_req, all) =>
      all.length < 2
        ? { status: 409, body: { error: "still processing", code: "idempotency_in_progress" }, headers: { "retry-after": "0" } }
        : { body: { comment: { id: "c" } } };
    await client.comments.create(T, "x", { idempotencyKey: "k" });
    assert.equal(server.requests.length, 2);
  });

  test("4xx other than 429 are never retried", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ status: 401, body: { error: "Invalid or missing API key." } });
    await assert.rejects(client.projects.list(), (e) => e.code === "unauthorized");
    assert.equal(server.requests.length, 1);
  });
});
