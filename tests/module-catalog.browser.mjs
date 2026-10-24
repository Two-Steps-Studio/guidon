// Component browser tests use an isolated fixture server and the actual catalog
// renderer/filter code. They do not authenticate to or mutate a deployed app.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { ModuleCatalogScreen, ModulePermissionList, filterModuleCatalog } from "../src/lib/work/module-catalog.ts";
import { ModuleView } from "../src/lib/work/module-view.ts";
import { moduleManifestSchema } from "../src/lib/work/module-manifest.ts";
import { parseModuleRecords } from "../src/lib/work/module-records.ts";
import { isSignedInSection } from "../src/lib/agent-web.ts";
import { ModuleInstallFields } from "../src/lib/work/module-install-fields.ts";
import { installCatalogModule } from "../src/lib/work/module-installation.ts";

const messages = JSON.parse(await readFile(new URL("../messages/en.json", import.meta.url), "utf8"));
const labels = messages.moduleCatalog;
for (const route of ["/marketplace", "/marketplace/release-planning/1.0.0", "/my-modules"]) assert.equal(isSignedInSection(route), true);
const items = [
  { moduleId: "release-planning", version: "1.0.0", name: "Release planning", author: "Guidon", description: "Plan a release.", category: "planning", compatible: true },
  { moduleId: "research", version: "1.0.0", name: "Research hub", author: "Example", description: "Record research.", category: "research", compatible: true },
  { moduleId: "operations", version: "2.0.0", name: "Operations board", author: "Example", description: "Track operations.", category: "operations", compatible: false },
];
const manifest = moduleManifestSchema.parse(JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning.json", import.meta.url), "utf8")));
const records = parseModuleRecords(manifest, JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning-data.json", import.meta.url), "utf8")));
const runtimeLabels = { empty: "Empty", yes: "Yes", no: "No", ungrouped: "Unassigned", unscheduled: "Unscheduled", edit: "Edit", remove: "Remove", actions: "Actions", count: "Record count" };
const cssRoot = new URL("../.next/static/", import.meta.url);
const cssFiles = (await readdir(cssRoot, { recursive: true })).filter((name) => name.endsWith(".css"));
assert.ok(cssFiles.length, "Run npm run build first so responsive styles are tested.");
const styles = (await Promise.all(cssFiles.map((name) => readFile(new URL(name.replaceAll("\\", "/"), cssRoot), "utf8")))).join("\n");

assert.equal(filterModuleCatalog(items, { q: "GUIDON", category: "planning", compatibility: "compatible" }).length, 1);
const disclosed = renderToStaticMarkup(h(ModulePermissionList, { permissions: ["module-data:read", "module-data:write", "tasks:read"], labels: { read: "Read module records", write: "Write module records", none: "None" } }));
for (const text of ["Read module records", "Write module records", "tasks:read"]) assert.ok(disclosed.includes(text));
const attack = '<img src=x onerror="alert(1)">';
const safeHtml = renderToStaticMarkup(h(ModuleCatalogScreen, { items: [{ ...items[0], name: attack, description: attack }], filters: { q: "", category: "", compatibility: "" }, labels }));
assert.equal(safeHtml.includes("<img"), false);
assert.match(safeHtml, /&lt;img/);

const installed = new Map();
let installationWrites = 0;
const installStore = {
  getProject: async (id) => id === "test-project" ? { organizationId: "test-org", canManage: true } : null,
  getEntry: async () => ({ manifest, organizationId: null, compatible: true, digest: "fixture-artifact" }),
  getExisting: async (id) => installed.get(id) ?? null,
  insert: async (id,definition) => { installationWrites++;installed.set(id,{ manifest:definition });return "created"; },
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "POST" && url.pathname === "/install") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    const result = await installCatalogModule({ projectId: form.get("projectId"),moduleId:manifest.id,version:manifest.version,permissions:form.get("approve")==="on" ? form.getAll("permissions") : null,expectedDigest:form.get("digest") },installStore);
    response.writeHead(303,{location:`/installation-result?error=${result.error ?? ""}&existing=${result.existing ?? false}`});response.end();return;
  }
  const content = url.pathname === "/install"
    ? h("form",{action:"/install",method:"post",className:"space-y-4 p-6"},h(ModuleInstallFields,{projects:[{id:"test-project",name:"Test project"}],permissions:manifest.permissions,digest:"fixture-artifact",labels:{project:"Project",chooseProject:"Choose project",consent:"I approve these permissions",install:"Install module"}}))
    : url.pathname === "/installation-result" ? h("p",null,url.searchParams.get("error") || "Installed")
    : url.pathname === "/preview"
    ? h("main", { className: "space-y-6 p-8" }, h("header", null, h("h1", { className: "text-3xl font-semibold" }, "Release planning"), h("p", { className: "text-muted-foreground" }, "Sample project data · Guidon")), ...manifest.views.filter((view) => ["table", "board"].includes(view.type)).map((view) => h("section", { key: view.id, className: "space-y-3 rounded-lg border bg-card p-5" }, h("h2", { className: "text-lg font-semibold" }, view.name), h(ModuleView, { manifest, view, records, labels: runtimeLabels }))))
    : h(ModuleCatalogScreen, { items, labels, filters: { q: url.searchParams.get("q") ?? "", category: url.searchParams.get("category") ?? "", compatibility: url.searchParams.get("compatibility") ?? "" } });
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body class="bg-background text-foreground">${renderToStaticMarkup(content)}</body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/marketplace`);
  assert.equal(await page.locator("article").count(), 3);
  await page.getByRole("searchbox", { name: labels.search }).fill("research");
  await page.getByRole("button", { name: labels.search }).click();
  await page.waitForURL(/q=research/);
  assert.equal(await page.locator("article").count(), 1);
  assert.match(await page.locator("article").innerText(), /Research hub/);
  await page.getByLabel(labels.category, { exact: true }).selectOption("operations");
  await page.getByRole("button", { name: labels.search }).click();
  await page.waitForURL(/category=operations/);
  assert.equal(await page.getByRole("status").textContent(), labels.empty);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: labels.search }).click();
  await page.waitForURL((url) => url.searchParams.get("q") === "");
  assert.equal(await page.locator("article").count(), 1);
  await page.getByLabel(labels.compatibility, { exact: true }).selectOption("compatible");
  await page.getByRole("button", { name: labels.search }).click();
  await page.waitForURL(/compatibility=compatible/);
  assert.equal(await page.locator("article").count(), 0);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${origin}/marketplace`);
  await page.getByLabel(labels.category, { exact: true }).selectOption("planning");
  await page.getByRole("button", { name: labels.search }).click();
  await page.waitForURL(/category=planning/);
  assert.equal(await page.locator("article").count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await mkdir(new URL("../output/playwright/", import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL("../output/playwright/module-catalog-mobile.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true });
  assert.equal(await page.getByRole("link", { name: labels.details }).getAttribute("href"), "/marketplace/release-planning/1.0.0");

  await page.goto(`${origin}/install`);
  await page.getByLabel("Project",{exact:true}).selectOption("test-project");
  await page.getByRole("button",{name:"Install module"}).click();
  assert.equal(installationWrites,0,"Native required consent blocks submission.");
  await page.getByRole("checkbox",{name:"I approve these permissions"}).check();
  await page.getByRole("button",{name:"Install module"}).click();
  await page.waitForURL(/installation-result/);
  assert.equal(new URL(page.url()).searchParams.get("error"),"");
  assert.equal(installationWrites,1);
  await page.goto(`${origin}/install`);
  await page.getByLabel("Project",{exact:true}).selectOption("test-project");
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Install module"}).click();
  await page.waitForURL(/installation-result/);
  assert.equal(new URL(page.url()).searchParams.get("existing"),"true");
  assert.equal(installationWrites,1);
  const denied = await page.request.post(`${origin}/install`,{form:{projectId:"forbidden-project",approve:"on",digest:"fixture-artifact",permissions:"module-data:read"}});
  assert.equal(new URL(denied.url()).searchParams.get("error"),"permission");
  assert.equal(installationWrites,1);
  console.log("pass fixture HTTP installation flow: required consent, project choice, idempotent retry and server-side denial");

  if (process.argv.includes("--update-screenshots")) {
    await page.setViewportSize({ width: 1200, height: 720 });
    await page.goto(`${origin}/preview`);
    await mkdir(new URL("../public/module-media/", import.meta.url), { recursive: true });
    await page.screenshot({ path: path.resolve("public/module-media/release-planning.png") });
  }
  console.log("pass Playwright: browse, text/category/compatibility filters, empty state, preserved URL filters, mobile overflow and detail link");
  console.log("pass permission disclosure and untrusted catalog text escaping");
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
