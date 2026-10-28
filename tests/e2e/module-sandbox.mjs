import assert from "node:assert/strict";
import path from "node:path";

/**
 * Module scripts (engine 1.3) in a real browser: code saved from the Monaco
 * editor draws the module, a button saves an entry through the normal
 * validation, the worker has no network/eval/global access, an endless loop
 * is stopped while the page keeps working, and a viewer can't write.
 */
const SCRIPT = `
const probe = (fn) => { try { return String(fn()); } catch (error) { return "blocked"; } };
guidon.module({
  render(ctx) {
    const notes = ctx.records.filter((record) => record.entity === "note");
    return { type: "stack", children: [
      { type: "heading", text: "Sandbox notes: " + notes.length },
      { type: "text", text: "fetch=" + typeof fetch + " xhr=" + typeof XMLHttpRequest + " socket=" + typeof WebSocket + " eval=" + probe(() => Function("return 1")()) + " self=" + typeof self },
      { type: "list", children: notes.map((note) => ({ type: "text", text: String(note.values.text) })) },
      ...(ctx.canWrite ? [{ type: "input", name: "note", label: "New note" }, { type: "row", children: [{ type: "button", label: "Add note", action: "add" }, { type: "button", label: "Hang", action: "hang", variant: "outline" }] }] : []),
    ] };
  },
  onAction(action, payload, ctx) {
    if (action === "hang") { while (true) {} }
    console.log("adding", ctx.form.note);
    return { upsert: [{ entity: "note", values: { text: String(ctx.form.note || "").trim() || "empty" } }] };
  },
});
`;

export async function moduleSandboxCoverage({ page, context, origin, fixture, client, browserName, artifacts }) {
  const owner = fixture.users[0];
  const moduleId = `sandbox-${browserName}`;
  const manifest = {
    manifestVersion: 1, id: moduleId, name: `Sandbox ${browserName}`, version: "1.0.0", author: { name: "QA" }, engine: { minVersion: "1.0.0" },
    permissions: ["module-data:read", "module-data:write"],
    entities: [{ id: "note", name: "Note", fields: [{ id: "text", name: "Text", type: "text", required: true, maxLength: 500 }] }],
    views: [{ id: "notes", name: "Notes", type: "table", entity: "note", fields: ["text"] }],
  };
  const root = `${origin}/projects/${owner.projectId}`;
  async function login(user) {
    await context.clearCookies(); await page.goto(`${origin}/auth/login`);
    await page.locator("#email").fill(user.email); await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click(); await page.waitForURL(url => url.pathname === "/dashboard");
  }
  // Anything the sandbox frame or its worker asks the network for is a failure.
  const leaks = [];
  // The worker's own blob: script is local; anything else from the frame or worker is a leak.
  const watch = request => {
    if (/^(blob|data|about):/.test(request.url())) return;
    let frame = null; try { frame = request.frame(); } catch { /* worker requests have no frame */ }
    if (!frame || frame !== page.mainFrame()) leaks.push(request.url());
  };
  page.on("request", watch);
  await client.query("INSERT INTO project_module_packages(project_id,module_id,manifest,records) VALUES($1,$2,$3::jsonb,'[]')", [owner.projectId, moduleId, JSON.stringify(manifest)]);
  try {
    await login(owner);
    await page.goto(`${root}/modules/${moduleId}/code`);
    await page.locator(".monaco-editor").first().waitFor({ timeout: 30000 });
    await page.waitForFunction(() => globalThis.monaco?.editor?.getModels().length > 0);
    await page.evaluate(source => globalThis.monaco.editor.getModels()[0].setValue(source), SCRIPT);
    await page.getByRole("button", { name: "Run preview", exact: true }).click();
    await page.getByRole("heading", { name: "Sandbox notes: 0", exact: true }).waitFor();
    await page.getByRole("checkbox", { name: /Run this code for everyone/ }).check();
    await page.getByRole("button", { name: "Save code", exact: true }).click();
    await page.getByText("Code saved.", { exact: false }).waitFor();
    // Saving ends with router.refresh(); in WebKit that refresh can still be
    // in flight and interrupt the next page.goto.
    await page.waitForLoadState("networkidle");
    const stored = (await client.query("SELECT manifest FROM project_module_packages WHERE project_id=$1 AND module_id=$2", [owner.projectId, moduleId])).rows[0].manifest;
    assert.ok(stored.permissions.includes("code:run") && stored.views.some(view => view.type === "custom") && stored.engine.minVersion === "1.3.0");

    // The module's tab runs the saved code.
    await page.goto(`${root}/extensions/package/${moduleId}`);
    await page.locator("main select").first().selectOption("custom");
    await page.getByRole("heading", { name: "Sandbox notes: 0", exact: true }).waitFor();
    await page.getByText("fetch=undefined xhr=undefined socket=undefined eval=blocked self=undefined", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "New note", exact: true }).fill("Written by a script");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await page.getByRole("heading", { name: "Sandbox notes: 1", exact: true }).waitFor();
    const records = (await client.query("SELECT records FROM project_module_packages WHERE project_id=$1 AND module_id=$2", [owner.projectId, moduleId])).rows[0].records;
    assert.deepEqual(records.map(record => record.values.text), ["Written by a script"]);

    // An endless loop only stalls the worker: it is stopped and the page stays usable.
    const started = Date.now();
    await page.getByRole("button", { name: "Hang", exact: true }).click();
    await page.getByText(/didn't answer within 2 s/).waitFor({ timeout: 10000 });
    assert.ok(Date.now() - started < 9000);
    await page.getByRole("button", { name: "Restart", exact: true }).click();
    await page.getByRole("heading", { name: "Sandbox notes: 1", exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, `${browserName}-module-sandbox.png`), fullPage: true });

    // A viewer sees the module but the script gets canWrite=false.
    await login(fixture.reader);
    await page.goto(`${root}/extensions/package/${moduleId}`);
    await page.locator("main select").first().selectOption("custom");
    await page.getByRole("heading", { name: "Sandbox notes: 1", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add note", exact: true }).count(), 0);
    // Next can stream notFound() with HTTP 200 (and ships the editor's labels with every page), so look for the rendered title.
    assert.equal((await (await context.request.get(`${root}/modules/${moduleId}/code`)).text()).includes(`Code: Sandbox ${browserName}`), false, "Viewers don't get the code editor");
    assert.deepEqual(leaks, [], `The sandbox made requests: ${leaks.join(", ")}`);
  } finally {
    page.off("request", watch);
    await client.query("DELETE FROM project_module_packages WHERE project_id=$1 AND module_id=$2", [owner.projectId, moduleId]);
    await context.clearCookies();
  }
}
