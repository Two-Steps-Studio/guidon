import assert from "node:assert/strict";
import path from "node:path";

/**
 * Project sections QA: roadmap, decisions, knowledge, files and module
 * export. For each one: the owner creates through the real UI, the result
 * survives a reload and matches the database, hostile text stays text, the
 * project viewer reads without write controls and another tenant gets
 * nothing. Files: the download link is signed, and a changed path or
 * signature is refused.
 */
export async function projectSectionCoverage({ page, context, origin, fixture, client, browserName, artifacts }) {
  const [owner, foreign] = fixture.users;
  const root = `${origin}/projects/${owner.projectId}`;
  const marker = `${browserName}-${Date.now()}`;
  // Executes only if rendered as HTML; the assertions look for its side effect.
  const payload = (label) => `${label} ${marker} <img src=x onerror="window.__sectionXss=1">`;
  const created = { decision: payload("Decision"), phase: payload("Phase"), source: payload("Source") };
  const fileName = `qa-${marker}.txt`;
  async function login(user) {
    await context.clearCookies(); await page.goto(`${origin}/auth/login`);
    await page.locator("#email").fill(user.email); await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click(); await page.waitForURL(url => url.pathname === "/dashboard");
  }
  async function noInjectedMarkup() {
    assert.equal(await page.evaluate(() => window.__sectionXss), undefined, "Untrusted text must never run as HTML");
    assert.equal(await page.locator('main img[src="x"]').count(), 0);
  }
  async function create(section, open, fill, submit, title) {
    await page.goto(`${root}/${section}`);
    await page.getByRole("button", { name: open, exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await fill(dialog);
    await dialog.getByRole("button", { name: submit, exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.reload();
    await page.getByText(title, { exact: true }).first().waitFor();
    await noInjectedMarkup();
  }
  try {
    await login(owner);
    await create("decisions", "New Decision", async dialog => {
      await dialog.getByLabel("Title", { exact: true }).fill(created.decision);
      await dialog.getByLabel("Description", { exact: true }).fill(`<script>window.__sectionXss=1</script>`);
    }, "Create Decision", created.decision);
    await create("roadmap", "New Phase", async dialog => {
      await dialog.getByLabel("Phase Name", { exact: true }).fill(created.phase);
    }, "Create Phase", created.phase);

    // Knowledge: the server refuses a non-http(s) link even when the browser's own check is bypassed.
    await page.goto(`${root}/knowledge`);
    await page.getByRole("button", { name: "New entry", exact: true }).first().click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title", { exact: true }).fill(created.source);
    await dialog.getByLabel("Link (optional)", { exact: true }).fill("javascript:alert(1)");
    await dialog.locator("form").evaluate(form => { form.noValidate = true; });
    await dialog.getByRole("button", { name: "Create entry", exact: true }).click();
    await dialog.getByText("Link must be a valid http(s) URL.", { exact: true }).waitFor();
    await dialog.getByLabel("Link (optional)", { exact: true }).fill("https://useguidon.com/developers");
    await dialog.getByRole("button", { name: "Create entry", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.reload();
    const sourceLink = page.locator('main a[href="https://useguidon.com/developers"]').first();
    await sourceLink.waitFor();
    assert.match(await sourceLink.getAttribute("rel") ?? "", /noopener/);
    await noInjectedMarkup();

    // Files: upload, then reload shows it.
    await page.goto(`${root}/files`);
    // The input is server-rendered; a file set before React attaches its onChange is lost.
    await page.waitForFunction(() => { const input = document.querySelector('input[type="file"]'); return !!input && Object.keys(input).some(key => key.startsWith("__reactProps")); });
    await page.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: "text/plain", buffer: Buffer.from(`QA ${marker}\n`) });
    await page.getByText(fileName, { exact: true }).first().waitFor();
    await page.reload(); await page.getByText(fileName, { exact: true }).first().waitFor();

    const rows = (await client.query(`SELECT
      (SELECT title FROM context_decisions WHERE project_id=$1 AND title=$2) AS decision,
      (SELECT name FROM roadmap_phases WHERE project_id=$1 AND name=$3) AS phase,
      (SELECT url FROM context_sources WHERE project_id=$1 AND title=$4) AS source_url,
      (SELECT storage_path FROM project_files WHERE project_id=$1 AND name=$5) AS storage_path`,
    [owner.projectId, created.decision, created.phase, created.source, fileName])).rows[0];
    assert.equal(rows.decision, created.decision, "Decision saved exactly as typed");
    assert.equal(rows.phase, created.phase, "Phase saved exactly as typed");
    assert.equal(rows.source_url, "https://useguidon.com/developers", "Only the valid link was saved");
    assert.ok(rows.storage_path?.includes(owner.projectId), "A file is stored under its own project");

    // Signed download link works; a changed path or signature does not.
    const file = (await client.query("SELECT id FROM project_files WHERE project_id=$1 AND name=$2", [owner.projectId, fileName])).rows[0];
    await page.getByRole("button", { name: `Options for ${fileName}`, exact: true }).click();
    const download = page.waitForEvent("download").catch(() => null);
    const navigation = page.waitForRequest(request => request.url().includes("/api/storage?"));
    await page.getByRole("menuitem", { name: "Download", exact: true }).click();
    const signed = new URL((await navigation).url());
    await download;
    assert.equal((await context.request.get(signed.toString())).status(), 200, "Signed link downloads the file");
    const tampered = new URL(signed); tampered.searchParams.set("path", signed.searchParams.get("path").replace(owner.projectId, foreign.projectId));
    assert.notEqual((await context.request.get(tampered.toString())).status(), 200, "A signature is bound to its path");
    const forged = new URL(signed); forged.searchParams.set("signature", "0".repeat(64));
    assert.notEqual((await context.request.get(forged.toString())).status(), 200, "A forged signature is refused");
    assert.ok(file?.id);

    // Viewer: reads every section, gets no write controls.
    await login(fixture.reader);
    for (const [section, title, control] of [["decisions", created.decision, "New Decision"], ["roadmap", created.phase, "New Phase"], ["knowledge", created.source, "New entry"], ["files", fileName, "Upload File"]]) {
      await page.goto(`${root}/${section}`);
      await page.getByText(title, { exact: true }).first().waitFor();
      assert.equal(await page.getByRole("button", { name: control, exact: true }).count(), 0, `Viewer has no "${control}" on ${section}`);
    }
    await page.screenshot({ path: path.join(artifacts, `${browserName}-sections-viewer.png`), fullPage: true });

    // Another tenant: no page, no titles, no file listing.
    await login(foreign);
    for (const section of ["decisions", "roadmap", "knowledge", "files"]) {
      const response = await context.request.get(`${root}/${section}`);
      const html = await response.text();
      for (const value of [marker, fileName]) assert.equal(html.includes(value), false, `Another tenant must not see ${section} content`);
    }
    const exported = await context.request.get(`${root}/modules/anything/export`);
    assert.equal(exported.status(), 403, "Module export is refused outside the project");
  } finally {
    await client.query("DELETE FROM context_decisions WHERE project_id=$1 AND title=$2", [owner.projectId, created.decision]);
    await client.query("DELETE FROM roadmap_phases WHERE project_id=$1 AND name=$2", [owner.projectId, created.phase]);
    await client.query("DELETE FROM context_sources WHERE project_id=$1 AND title=$2", [owner.projectId, created.source]);
    await client.query("DELETE FROM project_files WHERE project_id=$1 AND name=$2", [owner.projectId, fileName]);
    await context.clearCookies();
  }
}
