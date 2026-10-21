import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockServer } from "./mock-server.mjs";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const KEY = "guidon_cli_test";
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
  sort_order: 0,
  ...over,
});

let server;
let home;
before(async () => {
  server = await startMockServer();
});
after(() => server.close());
beforeEach(async () => {
  server.requests.length = 0;
  for (const key of Object.keys(server.routes)) delete server.routes[key];
  if (home) await rm(home, { recursive: true, force: true });
  home = await mkdtemp(join(tmpdir(), "guidon-cli-"));
});

/** Runs the CLI; env defaults to a logged-out user pointed at the mock. */
function run(args, { env = {}, stdin } = {}) {
  const fullEnv = { PATH: process.env.PATH, HOME: home, GUIDON_BASE_URL: server.url, ...env };
  for (const [k, v] of Object.entries(fullEnv)) if (v === undefined) delete fullEnv[k];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: fullEnv, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin ?? "");
  });
}
const withKey = { env: { GUIDON_API_KEY: KEY } };
const configFile = () => join(home, ".config", "guidon", "config.json");

describe("argument handling", () => {
  test("--version and --help", async () => {
    const v = await run(["--version"]);
    assert.equal(v.code, 0);
    assert.match(v.stdout, /^\d+\.\d+\.\d+\n$/);
    const h = await run(["--help"]);
    assert.equal(h.code, 0);
    assert.match(h.stdout, /guidon tasks create --project <id> --title <title>/);
    const sub = await run(["tasks", "move", "--help"]);
    assert.equal(sub.code, 0);
    assert.match(sub.stdout, /Usage: guidon tasks move <taskId> <status>/);
  });

  test("no command prints help to stderr with exit 2", async () => {
    const r = await run([]);
    assert.equal(r.code, 2);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Usage:/);
  });

  test("unknown commands and options are usage errors", async () => {
    let r = await run(["frobnicate"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown command "frobnicate"/);
    r = await run(["tasks", "nope"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /try: guidon tasks list/);
    r = await run(["projects", "list", "--bogus"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Unknown option '--bogus'/);
    r = await run(["projects", "list", "--title", "x"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--title is not valid for `guidon projects list`/);
    r = await run(["projects", "list", "extra"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unexpected argument "extra"/);
    assert.equal(server.requests.length, 0);
  });

  test("missing required arguments", async () => {
    let r = await run(["tasks", "list"], withKey);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /missing --project <id>/);
    r = await run(["tasks", "create", "--project", P], withKey);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /missing --title/);
    r = await run(["tasks", "move", T], withKey);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /missing <status>/);
    r = await run(["tasks", "comment", T], withKey);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /missing <text>/);
    r = await run(["tasks", "move", T, "In Progress"], withKey);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /invalid status "In Progress"/);
    r = await run(["tasks", "create", "--project", P, "--title", "x", "--due", "someday"], withKey);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /invalid --due/);
    assert.equal(server.requests.length, 0);
  });

  test("usage errors as JSON with --json", async () => {
    const r = await run(["tasks", "list", "--json"], withKey);
    assert.equal(r.code, 2);
    assert.deepEqual(JSON.parse(r.stderr), { error: { code: "usage", message: "missing --project <id>" } });
  });

  test("not logged in -> exit 3", async () => {
    const r = await run(["projects", "list"]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /not logged in - run `guidon login`/);
  });
});

describe("login / logout", () => {
  test("login stores the key with mode 0600 after verifying it", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ body: { projects: [] } });
    const r = await run(["login"], { stdin: `${KEY}\n` });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Logged in to/);
    assert.equal(server.requests[0].headers.authorization, `Bearer ${KEY}`);
    const saved = JSON.parse(await readFile(configFile(), "utf8"));
    assert.equal(saved.apiKey, KEY);
    assert.equal(saved.baseUrl, server.url);
    if (process.platform !== "win32") {
      assert.equal((await stat(configFile())).mode & 0o777, 0o600);
      assert.equal((await stat(join(home, ".config", "guidon"))).mode & 0o777, 0o700);
    }

    // The saved login is used by later commands (no env key, no env base URL).
    server.routes["GET /api/v1/projects"] = () => ({ body: { projects: [{ id: P, name: "Game" }] } });
    const list = await run(["projects", "list"], { env: { GUIDON_BASE_URL: undefined } });
    assert.equal(list.code, 0, list.stderr);
    assert.match(list.stdout, /Game/);
    assert.equal(server.requests.at(-1).headers.authorization, `Bearer ${KEY}`);

    const out = await run(["logout"]);
    assert.equal(out.code, 0);
    await assert.rejects(stat(configFile()));
  });

  test("login reads GUIDON_API_KEY and tightens an existing file's mode", async () => {
    await mkdir(join(home, ".config", "guidon"), { recursive: true });
    await writeFile(configFile(), "{}", { mode: 0o644 });
    server.routes["GET /api/v1/projects"] = () => ({ body: { projects: [] } });
    const r = await run(["login", "--json"], { env: { GUIDON_API_KEY: "guidon_env" } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).verified, true);
    assert.equal(JSON.parse(await readFile(configFile(), "utf8")).apiKey, "guidon_env");
    if (process.platform !== "win32") assert.equal((await stat(configFile())).mode & 0o777, 0o600);
  });

  test("login rejects an invalid key and saves nothing", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ status: 401, body: { error: "Invalid or missing API key." } });
    const r = await run(["login", "--api-key", "guidon_bad"]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /Invalid or missing API key\. \(HTTP 401, unauthorized\)/);
    await assert.rejects(stat(configFile()));
  });

  test("login accepts a key without tasks:read (403) with a warning", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ status: 403, body: { error: "This API key does not have the 'tasks:read' scope." } });
    const r = await run(["login", "--api-key", "guidon_narrow"]);
    assert.equal(r.code, 0);
    assert.match(r.stderr, /warning: key accepted/);
  });

  test("login --no-verify skips the network", async () => {
    const r = await run(["login", "--api-key", KEY, "--no-verify", "--base-url", "https://guidon.example.com/api/v1/"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(server.requests.length, 0);
    assert.equal(JSON.parse(await readFile(configFile(), "utf8")).baseUrl, "https://guidon.example.com");
  });

  test("login with no key at all", async () => {
    const r = await run(["login"], { stdin: "" });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /no API key given/);
  });
});

describe("commands", () => {
  test("projects list: table and --json", async () => {
    const projects = [
      { id: P, name: "Game", organization_id: "o" },
      { id: "33333333-3333-4333-8333-333333333333", name: "Website", organization_id: "o" },
    ];
    server.routes["GET /api/v1/projects"] = () => ({ body: { projects } });
    const human = await run(["projects", "list"], withKey);
    assert.equal(human.code, 0);
    const lines = human.stdout.trimEnd().split("\n");
    assert.match(lines[0], /^ID\s+NAME$/);
    assert.match(lines[1], new RegExp(`^${P}\\s+Game$`));
    assert.equal(lines.length, 3);
    const js = await run(["projects", "list", "--json"], withKey);
    assert.deepEqual(JSON.parse(js.stdout), projects);
    assert.equal(server.requests.at(-1).headers.authorization, `Bearer ${KEY}`);
    assert.match(server.requests.at(-1).headers["user-agent"], /guidon-cli\//);
  });

  test("--api-key and --base-url flags override the environment", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ body: { projects: [] } });
    const r = await run(["projects", "list", "--api-key", "guidon_flag", "--base-url", server.url], {
      env: { GUIDON_API_KEY: KEY, GUIDON_BASE_URL: "http://127.0.0.1:1" },
    });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, "No projects.\n");
    assert.equal(server.requests[0].headers.authorization, "Bearer guidon_flag");
  });

  test("tasks list with --status filter", async () => {
    server.routes[`GET /api/v1/projects/${P}/tasks`] = () => ({
      body: {
        tasks: [
          task({ id: "a", title: "Alpha", status: "todo", priority: "high" }),
          task({ id: "b", title: "Beta", status: "done" }),
          task({ id: "c", title: "Gamma", status: "review", parent_task_id: "a" }),
        ],
      },
    });
    const r = await run(["tasks", "list", "--project", P, "--status", "todo,review"], withKey);
    assert.equal(r.code, 0, r.stderr);
    const lines = r.stdout.trimEnd().split("\n");
    assert.match(lines[0], /^ID\s+STATUS\s+PRIORITY\s+TITLE$/);
    assert.match(lines[1], /^a\s+todo\s+high\s+Alpha$/);
    assert.match(lines[2], /^c\s+review\s+medium\s+↳ Gamma$/);
    assert.equal(lines.length, 3);

    const js = await run(["tasks", "list", "-p", P, "--top-level", "--json"], withKey);
    assert.deepEqual(JSON.parse(js.stdout).map((t) => t.id), ["a", "b"]);

    const none = await run(["tasks", "list", "--project", P, "--status", "ai_working"], withKey);
    assert.equal(none.stdout, "No tasks.\n");
  });

  test("tasks create sends the right body", async () => {
    server.routes[`POST /api/v1/projects/${P}/tasks`] = (req) => ({ body: { task: task({ ...req.body }) } });
    const r = await run(
      ["tasks", "create", "--project", P, "--title", "Fix the jump", "--description", "Feels floaty", "--priority", "high", "--status", "todo", "--idempotency-key", "k1"],
      withKey
    );
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`Created task ${T} \\(todo, high\\): Fix the jump`));
    const req = server.requests.at(-1);
    assert.deepEqual(req.body, { title: "Fix the jump", description: "Feels floaty", priority: "high", status: "todo" });
    assert.equal(req.headers["idempotency-key"], "k1");

    const js = await run(["tasks", "create", "--project", P, "--title", "Sub", "--parent", T, "--json"], withKey);
    assert.equal(JSON.parse(js.stdout).parent_task_id, T);
    assert.deepEqual(server.requests.at(-1).body, { title: "Sub", parent_task_id: T });
  });

  test("tasks move", async () => {
    server.routes[`PATCH /api/v1/tasks/${T}/status`] = (req) => ({ body: { task: task({ status: req.body.status }) } });
    const r = await run(["tasks", "move", T, "in_progress"], withKey);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, `Moved ${T} to in_progress: Fix the jump\n`);
    assert.deepEqual(server.requests.at(-1).body, { status: "in_progress" });
  });

  test("tasks comment joins words and reads stdin for -", async () => {
    server.routes[`POST /api/v1/tasks/${T}/comment`] = (req) => ({ body: { comment: { id: "c1", task_id: T, content: req.body.content } } });
    let r = await run(["tasks", "comment", T, "Looks", "good", "to", "me"], withKey);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, `Commented on ${T} (comment c1).\n`);
    assert.deepEqual(server.requests.at(-1).body, { content: "Looks good to me" });

    r = await run(["tasks", "comment", T, "-", "--json"], { ...withKey, stdin: "line one\nline two\n" });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).content, "line one\nline two");
  });

  test("tasks get", async () => {
    server.routes[`GET /api/v1/tasks/${T}`] = () => ({ body: { task: task({ description: "Line 1\nLine 2" }) } });
    const r = await run(["tasks", "get", T], withKey);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /^Fix the jump\n {2}id: +22222222/);
    assert.match(r.stdout, /\n {2}Line 2\n$/);
  });
});

describe("API errors and exit codes", () => {
  test("404 -> exit 4 with the server's message", async () => {
    server.routes[`PATCH /api/v1/tasks/${T}/status`] = () => ({ status: 404, body: { error: "Task not found." } });
    const r = await run(["tasks", "move", T, "done"], withKey);
    assert.equal(r.code, 4);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "guidon: error: Task not found. (HTTP 404, not_found)\n");
  });

  test("403 -> exit 3; --json error goes to stderr", async () => {
    server.routes[`POST /api/v1/tasks/${T}/comment`] = () => ({ status: 403, body: { error: "This API key does not have the 'comments:write' scope." } });
    const r = await run(["tasks", "comment", T, "hi", "--json"], withKey);
    assert.equal(r.code, 3);
    assert.deepEqual(JSON.parse(r.stderr), {
      error: { status: 403, code: "forbidden", message: "This API key does not have the 'comments:write' scope." },
    });
  });

  test("400 -> exit 1", async () => {
    server.routes[`POST /api/v1/projects/${P}/tasks`] = () => ({ status: 400, body: { error: "title is required." } });
    const r = await run(["tasks", "create", "--project", P, "--title", "x"], withKey);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /title is required\. \(HTTP 400, invalid_request\)/);
  });

  test("the server's hint is shown", async () => {
    server.routes[`GET /api/v1/tasks/${T}`] = () => ({ status: 404, body: { error: "Task not found.", code: "not_found", hint: "Check the id." } });
    const r = await run(["tasks", "get", T], withKey);
    assert.equal(r.code, 4);
    assert.equal(r.stderr, "guidon: error: Task not found. (HTTP 404, not_found)\nhint: Check the id.\n");
  });

  test("tasks list follows next_cursor", async () => {
    server.routes[`GET /api/v1/projects/${P}/tasks`] = (req) =>
      req.query.cursor ? { body: { tasks: [task({ id: "b" })], next_cursor: null } } : { body: { tasks: [task({ id: "a" })], next_cursor: "n1" } };
    const r = await run(["tasks", "list", "--project", P, "--json"], withKey);
    assert.deepEqual(JSON.parse(r.stdout).map((t) => t.id), ["a", "b"]);
  });

  test("401 shows a hint", async () => {
    server.routes["GET /api/v1/projects"] = () => ({ status: 401, body: { error: "Invalid or missing API key." } });
    const r = await run(["projects", "list"], withKey);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /hint: the API key is invalid or revoked/);
  });

  test("unreachable server -> exit 5", async () => {
    const r = await run(["projects", "list", "--base-url", "http://127.0.0.1:1"], withKey);
    assert.equal(r.code, 5);
    assert.match(r.stderr, /Could not reach Guidon/);
  });

  test("invalid base URL -> exit 2", async () => {
    const r = await run(["projects", "list", "--base-url", "ftp://nope"], withKey);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /base URL must be http/);
  });
});
