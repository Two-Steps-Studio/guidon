import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";

/**
 * Module automations (migration 094) and the module API/MCP surface:
 * an entry added in the UI creates a task and a notification once, a
 * non-matching entry does nothing, the log shows the run, a failed run is
 * retried from the log, and REST + MCP list/configure/install modules with
 * owner/admin checks and exact permission approval.
 */
export async function moduleAutomationCoverage({ page, context, origin, fixture, client, browserName }) {
  const owner = fixture.users[0];
  const moduleId = `bugs-${browserName}`;
  const manifest = {
    manifestVersion: 1, id: moduleId, name: `Bugs ${browserName}`, version: "1.0.0", author: { name: "QA" }, engine: { minVersion: "1.2.0" },
    permissions: ["module-data:read", "module-data:write", "tasks:write", "notifications:send"],
    entities: [{ id: "bug", name: "Bug", fields: [{ id: "title", name: "Title", type: "text", required: true, maxLength: 200 }, { id: "severity", name: "Severity", type: "select", required: false, options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }] }] }],
    views: [{ id: "all", name: "All bugs", type: "table", entity: "bug", fields: ["title", "severity"] }, { id: "new", name: "New bug", type: "form", entity: "bug", fields: ["title", "severity"] }],
    automations: [{ id: "triage", name: "Triage high bugs", trigger: { event: "record.created", entity: "bug", when: { field: "severity", equals: "high" } }, actions: [{ type: "create_task", title: "Fix: {{title}}", priority: "high" }, { type: "notify", title: "High bug: {{title}}" }] }],
  };
  const root = `${origin}/projects/${owner.projectId}`;
  const keys = {};
  for (const [name, user] of [["manager", owner.id], ["viewer", fixture.reader.id]]) {
    const raw = `guidon_${randomBytes(32).toString("base64url")}`;
    await client.query("INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash,scopes,human_client) VALUES($1,$2,$3,$4,$5,true)", [user, `E2E modules ${name} ${browserName}`, raw.slice(0, 12), createHash("sha256").update(raw).digest("hex"), ["project:read", "project:write"]]);
    keys[name] = raw;
  }
  const api = (method, path, key, data) => context.request.fetch(`${origin}${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, data: data === undefined ? undefined : JSON.stringify(data) });
  async function waitFor(check, label) {
    for (let i = 0; i < 40; i++) { const value = await check(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 500)); }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function login(user) {
    await context.clearCookies(); await page.goto(`${origin}/auth/login`);
    await page.locator("#email").fill(user.email); await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click(); await page.waitForURL(url => url.pathname === "/dashboard");
  }
  await client.query("INSERT INTO project_module_packages(project_id,module_id,manifest,records) VALUES($1,$2,$3::jsonb,'[]')", [owner.projectId, moduleId, JSON.stringify(manifest)]);
  try {
    await login(owner);
    await page.goto(`${root}/extensions/package/${moduleId}`);
    for (const [title, severity] of [["Crash on save", "high"], ["Typo in footer", "low"]]) {
      await page.getByRole("button", { name: "Add record", exact: true }).click();
      await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
      await page.getByRole("combobox", { name: "Severity", exact: true }).selectOption(severity);
      await page.getByRole("button", { name: "Save record", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Saved." }).waitFor().catch(() => {});
      await waitFor(async () => (await client.query("SELECT 1 FROM project_module_packages WHERE project_id=$1 AND module_id=$2 AND records::text LIKE $3", [owner.projectId, moduleId, `%${title}%`])).rowCount, `record ${title}`);
    }
    const run = await waitFor(async () => (await client.query("SELECT status, attempts, results FROM module_automation_runs WHERE project_id=$1 AND module_id=$2 AND status <> 'pending'", [owner.projectId, moduleId])).rows[0], "automation run");
    assert.equal(run.status, "succeeded", JSON.stringify(run));
    assert.equal((await client.query("SELECT count(*)::int n FROM module_automation_runs WHERE project_id=$1 AND module_id=$2", [owner.projectId, moduleId])).rows[0].n, 1, "Only the high-severity entry matches");
    const task = (await client.query("SELECT title, priority, created_by FROM tasks WHERE project_id=$1 AND title='Fix: Crash on save'", [owner.projectId])).rows;
    assert.equal(task.length, 1, "Exactly one task");
    assert.equal(task[0].priority, "high");
    assert.equal(task[0].created_by, owner.id);
    assert.equal((await client.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND type='module_automation' AND title='High bug: Crash on save'", [owner.id])).rows[0].n, 1);

    // A run that can't succeed fails for good and is retried from the log.
    await client.query("INSERT INTO module_automation_runs(project_id,module_id,automation_id,record_id,event,dedupe_key,triggered_by,status,attempts,last_error) VALUES($1,$2,'ghost',gen_random_uuid(),'record.created',$3,$4,'failed',1,'old error')", [owner.projectId, moduleId, `${moduleId}:ghost`, owner.id]);
    await page.goto(`${root}/modules/${moduleId}`);
    const log = page.getByRole("region", { name: "Automations", exact: true });
    await log.getByText("Triage high bugs", { exact: false }).first().waitFor();
    await log.getByRole("cell", { name: "Done", exact: false }).first().waitFor();
    await log.getByRole("button", { name: "Retry ghost", exact: true }).click();
    await log.getByText("The automation no longer exists in this module version.", { exact: true }).waitFor();
    assert.equal((await client.query("SELECT attempts FROM module_automation_runs WHERE dedupe_key=$1", [`${moduleId}:ghost`])).rows[0].attempts, 2);

    // REST: list, configure, runs; the viewer can read but not configure.
    const listed = await api("GET", `/api/v1/projects/${owner.projectId}/modules`, keys.manager);
    assert.equal(listed.status(), 200);
    const entry = (await listed.json()).modules.find((candidate) => candidate.module_id === moduleId);
    assert.deepEqual(entry.automations.map((automation) => automation.id), ["triage"]);
    assert.equal(entry.record_count, 2);
    assert.equal(JSON.stringify(entry).includes("Crash on save"), false, "Module records are not part of the API answer");
    assert.equal((await api("PATCH", `/api/v1/projects/${owner.projectId}/modules/${moduleId}`, keys.viewer, { action: "disable" })).status(), 403);
    const disabled = await api("PATCH", `/api/v1/projects/${owner.projectId}/modules/${moduleId}`, keys.manager, { action: "disable" });
    assert.equal(disabled.status(), 200);
    assert.equal((await disabled.json()).module.enabled, false);
    assert.equal((await api("PATCH", `/api/v1/projects/${owner.projectId}/modules/${moduleId}`, keys.manager, { action: "settings", category: "Quality" })).status(), 200);
    assert.equal((await client.query("SELECT settings->>'category' c, enabled FROM project_module_packages WHERE project_id=$1 AND module_id=$2", [owner.projectId, moduleId])).rows[0].c, "Quality");
    const runs = await api("GET", `/api/v1/projects/${owner.projectId}/modules/${moduleId}/runs`, keys.manager);
    assert.equal((await runs.json()).runs.length, 2);
    assert.equal(((await (await api("GET", `/api/v1/projects/${owner.projectId}/modules/${moduleId}/runs`, keys.viewer)).json()).runs ?? []).length, 0, "Viewers don't read the automation log");

    // Install from the Marketplace through the API: the permission list is the approval.
    const catalog = (await client.query("SELECT manifest FROM module_catalog_entries WHERE module_id='release-planning' AND version='1.0.0'")).rows[0];
    if (catalog) {
      await client.query("DELETE FROM project_module_packages WHERE project_id=$1 AND module_id='release-planning'", [owner.projectId]).catch(() => {});
      const missing = await api("POST", `/api/v1/projects/${owner.projectId}/modules`, keys.manager, { module_id: "release-planning", version: "1.0.0", permissions: ["module-data:read"] });
      assert.equal(missing.status(), 422, "Partial approval is refused");
      assert.equal((await api("POST", `/api/v1/projects/${owner.projectId}/modules`, keys.viewer, { module_id: "release-planning", version: "1.0.0", permissions: catalog.manifest.permissions })).status(), 403);
      const installed = await api("POST", `/api/v1/projects/${owner.projectId}/modules`, keys.manager, { module_id: "release-planning", version: "1.0.0", permissions: catalog.manifest.permissions });
      assert.ok([200, 201].includes(installed.status()), await installed.text());
      assert.equal((await client.query("SELECT catalog_version FROM project_module_packages WHERE project_id=$1 AND module_id='release-planning'", [owner.projectId])).rows[0]?.catalog_version, "1.0.0");
    }

    // MCP: the same surface as tools.
    const mcp = await context.request.post(`${origin}/api/mcp`, {
      headers: { authorization: `Bearer ${keys.manager}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      data: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_modules", arguments: { project_id: owner.projectId } } }),
    });
    assert.equal(mcp.status(), 200);
    assert.ok((await mcp.text()).includes(moduleId), "list_modules answers through MCP");
  } finally {
    await client.query("DELETE FROM module_automation_runs WHERE project_id=$1 AND module_id=$2", [owner.projectId, moduleId]);
    await client.query("DELETE FROM project_module_packages WHERE project_id=$1 AND module_id = ANY($2)", [owner.projectId, [moduleId, "release-planning"]]).catch(() => {});
    await client.query("DELETE FROM tasks WHERE project_id=$1 AND title='Fix: Crash on save'", [owner.projectId]);
    await context.clearCookies();
  }
}
