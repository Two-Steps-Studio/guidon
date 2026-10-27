import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function projectModuleCoverage({ page, context, origin, fixture, client, browserName, artifacts }) {
  const owner = fixture.users[0];
  const before = (await client.query("SELECT custom_modules, custom_modules_revision FROM projects WHERE id=$1", [owner.projectId])).rows[0];
  const manifest = JSON.parse(await readFile(new URL("../../examples/module-manifests/release-planning.json", import.meta.url), "utf8"));
  manifest.id = `nav-release-${browserName}`;
  manifest.name = `Navigation release ${browserName}`;
  const legacyId = `nav-checklist-${browserName}`;
  const content = [{ version: 1, id: legacyId, title: `Navigation checklist ${browserName}`, description: "Fixture", blocks: [{ type: "checklist", title: "Release gates", items: [{ label: "Only this checklist", done: false }] }] }, { version:1, id:`untouched-${browserName}`,title:"Untouched module",description:"",blocks:[{type:"text",title:"Original",text:"Preserve this content"}]}];
  const root = `${origin}/projects/${owner.projectId}`;
  async function login(user) {
    await context.clearCookies(); await page.goto(`${origin}/auth/login`);
    await page.locator("#email").fill(user.email); await page.locator("#password").fill(fixture.password);
    await page.locator('button[type="submit"]').click(); await page.waitForURL(url=>url.pathname==="/dashboard");
  }
  try {
    // Content modules as stored before 092, converted by the real migration.
    await client.query("UPDATE projects SET custom_modules=$2::jsonb, custom_modules_revision=custom_modules_revision+1 WHERE id=$1", [owner.projectId, JSON.stringify(content)]);
    await client.query(await readFile(new URL("../../src/db/migrations/092_content_modules_as_packages.sql", import.meta.url), "utf8"));
    await client.query("INSERT INTO project_module_packages(project_id,module_id,manifest,records) VALUES($1,$2,$3::jsonb,'[]')", [owner.projectId,manifest.id,JSON.stringify(manifest)]);
    await login(owner); await page.goto(`${root}/work`);
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await sidebar.getByRole("link",{name:manifest.name,exact:true}).click();
    await page.getByRole("heading",{name:manifest.name,level:1,exact:true}).waitFor();
    assert.equal(await sidebar.getByRole("link",{name:manifest.name,exact:true}).getAttribute("aria-current"),"page");
    await page.getByRole("button",{name:"Add record",exact:true}).click();
    await page.getByRole("textbox",{name:"Name",exact:true}).fill("Saved via dedicated page");
    await page.getByRole("combobox",{name:"Status",exact:true}).selectOption("ready");
    await page.getByRole("button",{name:"Save record",exact:true}).click();
    await page.getByText("Saved via dedicated page",{exact:true}).waitFor();
    await page.reload(); await page.getByText("Saved via dedicated page",{exact:true}).waitFor();
    // The converted content module is a page package with its own tab.
    await sidebar.getByRole("link",{name:content[0].title,exact:true}).click();
    await page.waitForURL(url=>url.pathname===`/projects/${owner.projectId}/extensions/package/${legacyId}`);
    await page.getByRole("heading",{name:content[0].title,level:1,exact:true}).waitFor();
    assert.equal(await page.getByText("Preserve this content",{exact:true}).count(),0);
    // A checkbox saves at once (Server Action POST); the panel re-renders from the saved data.
    const toggled = page.waitForResponse(response=>response.request().method()==="POST" && response.url().includes(`/extensions/package/${legacyId}`));
    await page.getByRole("checkbox",{name:"Only this checklist",exact:true}).check();
    await toggled;
    await page.getByRole("button",{name:"Add item",exact:true}).click();
    await page.getByRole("textbox",{name:"Item",exact:true}).fill("Added on the page");
    await page.getByRole("button",{name:"Save record",exact:true}).click();
    await page.getByText("Added on the page",{exact:true}).waitFor();
    await page.reload();
    assert.ok(await page.getByRole("checkbox",{name:"Only this checklist",exact:true}).isChecked());
    assert.equal(await page.getByRole("checkbox",{name:"Added on the page",exact:true}).isChecked(),false);
    const saved = (await client.query("SELECT module_id, records FROM project_module_packages WHERE project_id=$1 AND module_id = ANY($2) ORDER BY module_id",[owner.projectId,[legacyId,content[1].id]])).rows;
    assert.equal(saved.find(row=>row.module_id===legacyId).records.length,2);
    assert.deepEqual(saved.find(row=>row.module_id===content[1].id).records.map(record=>record.values),[{text:"Preserve this content"}],"Editing one module must leave the others alone");
    // Export carries the manifest plus the entries (the Modules page imports this file back).
    const exported = await context.request.get(`${root}/modules/${legacyId}/export`);
    assert.equal(exported.status(),200);
    assert.match(exported.headers()["content-disposition"] ?? "",/attachment/);
    const exportedJson = await exported.json();
    assert.equal(exportedJson.exportVersion,1);
    assert.equal(exportedJson.records.length,2);
    // Links from before 092 still land on the module.
    // Firefox reports the redirected navigation as aborted (NS_BINDING_ABORTED); the landing URL is what counts.
    await page.goto(`${root}/extensions/content/${legacyId}`).catch(error=>{if(!/NS_BINDING_ABORTED|ERR_ABORTED|interrupted/.test(error.message))throw error;});
    for(let i=0;i<60 && !new URL(page.url()).pathname.endsWith(`/extensions/package/${legacyId}`);i++)await page.waitForTimeout(250);
    assert.ok(new URL(page.url()).pathname.endsWith(`/extensions/package/${legacyId}`),`Old content link redirects to the module (at ${page.url()})`);
    await page.waitForLoadState();
    await page.setViewportSize({width:375,height:812});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(artifacts,`${browserName}-module-page-mobile.png`),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await login(fixture.reader); await page.goto(`${root}/extensions/package/${manifest.id}`);
    await page.getByText("Saved via dedicated page",{exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Add record",exact:true}).count(),0);
    await page.goto(`${root}/extensions/package/${legacyId}`);
    assert.ok(await page.getByRole("checkbox",{name:"Only this checklist",exact:true}).isDisabled(),"Viewers read a page module without editing it");
    assert.equal(await page.getByRole("button",{name:"Add item",exact:true}).count(),0);
    assert.equal((await context.request.get(`${root}/modules/${legacyId}/export`)).status(),403,"Only owners/admins export module data");
    await login(fixture.users[1]); await page.goto(`${root}/extensions/package/${manifest.id}`);
    assert.equal(await page.getByText("Saved via dedicated page",{exact:true}).count(),0);
    await login(owner);
    await client.query("UPDATE project_module_packages SET enabled=false WHERE project_id=$1 AND module_id=$2",[owner.projectId,manifest.id]);
    await page.goto(`${root}/work`);
    assert.equal(await sidebar.getByRole("link",{name:manifest.name,exact:true}).count(),0);
    const response = await page.goto(`${root}/extensions/package/${manifest.id}`);
    assert.ok([200,404].includes(response.status()),"Next streaming can retain HTTP 200 for notFound");
    await page.getByRole("heading",{name:"404",exact:true}).waitFor();
    assert.equal(await page.getByText("Saved via dedicated page",{exact:true}).count(),0);
  } finally {
    await client.query("DELETE FROM project_module_packages WHERE project_id=$1 AND module_id = ANY($2)",[owner.projectId,[manifest.id,legacyId,content[1].id]]);
    await client.query("UPDATE projects SET custom_modules=$2::jsonb, custom_modules_revision=custom_modules_revision+1 WHERE id=$1",[owner.projectId,JSON.stringify(before.custom_modules)]);
    await context.clearCookies(); await page.setViewportSize({width:1440,height:1000});
  }
}
