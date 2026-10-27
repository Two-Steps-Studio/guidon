// Large-project performance baseline: board render, REST pagination, search
// and parallel writes for projects with 100 / 1000 / 3000 tasks.
//
//   DATABASE_URL=postgres://... node tests/perf/large-project.mjs --origin http://127.0.0.1:5803 [--budgets tests/perf/budgets.json] [--out report.json]
//
// Needs a running production build (standalone server) on that database.
// Seeds its own user, organization, projects, tasks and API key with
// fictitious data and removes them afterwards. With --budgets, exits 1 when
// a p95 is over its budget (see docs/release/performance-baseline-2026-10-27.md).
import assert from "node:assert/strict";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { chromium } from "playwright";

const argument = (name, fallback) => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : fallback; };
const origin = argument("origin", "http://127.0.0.1:5803");
const budgets = argument("budgets") ? JSON.parse(readFileSync(argument("budgets"), "utf8")) : null;
const SIZES = (argument("sizes", "100,1000,3000")).split(",").map(Number);
const RUNS = Number(argument("runs", "5"));
const PARALLEL = 20;
assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required (a disposable database)");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Performance seeding runs only against a local app");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const marker = `perf-${randomBytes(4).toString("hex")}`;
const password = `Perf-${randomBytes(12).toString("hex")}!`;
const email = `${marker}@guidon.example.test`;
const results = {};
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]; };
const summarize = (values) => ({ p50: Math.round(percentile(values, 50)), p95: Math.round(percentile(values, 95)), runs: values.length });
async function timed(fn) { const start = performance.now(); const value = await fn(); return [performance.now() - start, value]; }

let userId, organizationId;
const projects = {};
let browser;
try {
  const salt = randomBytes(16);
  const hash = `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
  userId = (await client.query("INSERT INTO auth.users(email,encrypted_password,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3::jsonb) RETURNING id", [email, hash, JSON.stringify({ full_name: "Perf" })])).rows[0].id;
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  organizationId = (await client.query("INSERT INTO public.organizations(name,slug) VALUES($1,$1) RETURNING id", [marker])).rows[0].id;
  for (const size of SIZES) projects[size] = (await client.query("INSERT INTO public.projects(organization_id,name,visibility) VALUES($1,$2,'private') RETURNING id", [organizationId, `${marker}-${size}`])).rows[0].id;
  await client.query("COMMIT");
  // Realistic mix: every status, ~30% done, descriptions, a searchable word in 1% of titles.
  for (const size of SIZES) {
    await client.query(`INSERT INTO public.tasks(project_id,title,description,status,priority,created_by,created_at)
      SELECT $1, 'Task ' || g || CASE WHEN g % 100 = 0 THEN ' needle' ELSE '' END,
             repeat('Context for the task. ', 10),
             (ARRAY['backlog','todo','in_progress','review','done','done','done','todo','in_progress','backlog'])[1 + g % 10],
             (ARRAY['low','medium','high','critical'])[1 + g % 4], $2, now() - (g || ' minutes')::interval
      FROM generate_series(1, $3) g`, [projects[size], userId, size]);
  }
  // One key per project size: the per-key rate limit (60/min) is not what is being measured.
  const keyHeaders = async () => {
    const raw = `guidon_${randomBytes(32).toString("base64url")}`;
    await client.query("INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes,human_client) VALUES($1,$2,$3,$4,$5,true)", [userId, marker, raw.slice(0, 12), createHash("sha256").update(raw).digest("hex"), ["tasks:read", "tasks:write", "project:read"]]);
    return { authorization: `Bearer ${raw}`, "content-type": "application/json" };
  };

  browser = await chromium.launch();
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${origin}/auth/login`);
  await page.locator("#email").fill(email); await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click(); await page.waitForURL((url) => url.pathname === "/dashboard");

  for (const size of SIZES) {
    const project = projects[size];
    const headers = await keyHeaders();
    const entry = results[size] = {};
    // Board: navigation until the cards are in the DOM (server render + hydration + layout).
    await page.goto(`${origin}/projects/${project}/work`); // warm-up, not counted
    const board = []; let cards = 0;
    for (let run = 0; run < RUNS; run++) {
      const [ms] = await timed(async () => {
        await page.goto(`${origin}/projects/${project}/work`, { waitUntil: "load" });
        await page.locator("article[data-card-id]").first().waitFor();
        await page.waitForFunction(() => document.readyState === "complete");
      });
      board.push(ms);
      cards = await page.locator("article[data-card-id]").count();
    }
    entry.boardLoadMs = summarize(board);
    entry.boardCards = cards;
    const server = [];
    for (let run = 0; run < RUNS; run++) server.push((await timed(() => context.request.get(`${origin}/projects/${project}/work`)))[0]);
    entry.boardServerMs = summarize(server);
    entry.boardCapNotice = await page.getByRole("status").filter({ hasText: "This board shows" }).count() === 1;
    // Over the board's cap (page.tsx TASK_LIMIT, 1000) the board must say so instead of silently dropping tasks.
    assert.equal(entry.boardCapNotice, size > 1000, `Board cap notice for ${size} tasks`);

    // REST: first page (100) and walking every page.
    const first = [];
    for (let run = 0; run < RUNS; run++) first.push((await timed(async () => { const response = await context.request.get(`${origin}/api/v1/projects/${project}/tasks?limit=100`, { headers }); assert.equal(response.status(), 200); }))[0]);
    entry.apiFirstPageMs = summarize(first);
    const [walkMs, walked] = await timed(async () => {
      let cursor = null; let count = 0; let pages = 0;
      do {
        const response = await context.request.get(`${origin}/api/v1/projects/${project}/tasks?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { headers });
        assert.equal(response.status(), 200);
        const body = await response.json(); count += body.tasks.length; cursor = body.next_cursor; pages++;
      } while (cursor);
      return { count, pages };
    });
    assert.equal(walked.count, size, "Pagination returns every task exactly once");
    entry.apiWalkAllMs = Math.round(walkMs);
    entry.apiPages = walked.pages;

    // Search (session): a word in 1% of titles.
    const search = [];
    for (let run = 0; run < RUNS; run++) search.push((await timed(async () => { const response = await context.request.get(`${origin}/api/v1/search?q=needle&project_id=${project}`); assert.equal(response.status(), 200); }))[0]);
    entry.searchMs = summarize(search);

    // Parallel writes: PARALLEL updates at once, all must succeed.
    const ids = (await client.query("SELECT id FROM public.tasks WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2", [project, PARALLEL])).rows.map((row) => row.id);
    const [parallelMs, statuses] = await timed(() => Promise.all(ids.map(async (id, index) => (await context.request.fetch(`${origin}/api/v1/tasks/${id}`, { method: "PATCH", headers, data: JSON.stringify({ title: `Parallel ${index}` }) })).status())));
    assert.deepEqual([...new Set(statuses)], [200], `Parallel writes: ${statuses.join(",")}`);
    entry.parallelWritesMs = Math.round(parallelMs);
    console.log(size, JSON.stringify(entry));
  }
} finally {
  await browser?.close();
  if (userId) {
    await client.query("DELETE FROM public.api_keys WHERE user_id=$1", [userId]).catch(() => {});
    if (organizationId) await client.query("DELETE FROM public.organizations WHERE id=$1", [organizationId]).catch((error) => console.error("cleanup", error.message));
    await client.query("DELETE FROM auth.users WHERE id=$1", [userId]).catch((error) => console.error("cleanup", error.message));
  }
  await client.end();
}

const report = { origin, measuredAt: new Date().toISOString(), runs: RUNS, parallel: PARALLEL, results };
if (argument("out")) writeFileSync(argument("out"), JSON.stringify(report, null, 2));
if (budgets) {
  const over = [];
  for (const [size, metrics] of Object.entries(budgets)) if (!size.startsWith("_")) for (const [metric, limit] of Object.entries(metrics)) {
    const value = results[size]?.[metric]; const measured = typeof value === "object" ? value.p95 : value;
    if (measured === undefined) continue;
    if (measured > limit) over.push(`${size} tasks ${metric}: ${measured} ms > budget ${limit} ms`);
  }
  if (over.length) { console.error(`Over budget:\n  ${over.join("\n  ")}`); process.exitCode = 1; } else console.log("All metrics within budget");
}
