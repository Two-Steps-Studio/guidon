let passed = 0;
function test(name, check) { check(); passed++; console.log(`pass ${name}`); }
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { register } from "node:module";
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/lib/work/') && /^\\.\\/(module|custom)-[a-z-]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}`)}`, import.meta.url);
const { CUSTOM_MODULE_PRESETS, customModuleSchema, customModulesSchema } = await import("../src/lib/work/custom-modules.ts");
const { convertContentModule, legacyModuleId } = await import("../src/lib/work/module-legacy.ts");
const { ModulePage } = await import("../src/lib/work/module-page.ts");
const { ModuleView } = await import("../src/lib/work/module-view.ts");
const { moduleManifestSchema } = await import("../src/lib/work/module-manifest.ts");
const { parseModuleRecords } = await import("../src/lib/work/module-records.ts");

test("presets survive JSON export/import with checklist state", () => {
  const modules = structuredClone(CUSTOM_MODULE_PRESETS);
  modules[0].blocks[0].items[0].done = true;
  assert.deepEqual(customModulesSchema.parse(JSON.parse(JSON.stringify(modules))), modules);
});
test("rejects executable links and malformed URLs without throwing", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "not a url"]) {
    const candidate = { ...CUSTOM_MODULE_PRESETS[1], blocks: [{ type: "links", title: "Links", items: [{ label: "Link", url }] }] };
    assert.equal(customModuleSchema.safeParse(candidate).success, false);
  }
});
test("rejects duplicate IDs, unsupported blocks, versions and oversized modules", () => {
  const preset = CUSTOM_MODULE_PRESETS[0];
  assert.equal(customModulesSchema.safeParse([preset, preset]).success, false);
  assert.equal(customModuleSchema.safeParse({ ...preset, version: 2 }).success, false);
  assert.equal(customModuleSchema.safeParse({ ...preset, blocks: [{ type: "script", text: "alert(1)" }] }).success, false);
  assert.equal(customModuleSchema.safeParse({ ...preset, title: "x".repeat(101) }).success, false);
  const modules = Array.from({ length: 21 }, (_, i) => ({ ...preset, id: `module-${i}` }));
  assert.equal(customModulesSchema.safeParse(modules).success, false);
});

test("renders page content as escaped text and keeps external links isolated", () => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const { manifest, records } = convertContentModule({
    version: 1,
    id: "safe-render",
    title: payload,
    description: payload,
    blocks: [
      { type: "text", title: payload, text: payload },
      { type: "checklist", title: "Steps", items: [{ label: payload, done: false }] },
      { type: "links", title: "Links", items: [{ label: payload, url: "https://example.com/docs" }] },
    ],
  });
  const labels = { empty: "Empty", edit: "Edit", remove: "Remove" };
  const html = renderToStaticMarkup(createElement("article", null, manifest.name, manifest.description, createElement(ModulePage, { view: manifest.views[0], records, labels, onToggle: () => {}, onEdit: () => {}, onRemove: () => {} })));
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("&lt;img"), true);
  assert.equal(html.includes("&lt;script"), true);
  assert.match(html, /href="https:\/\/example.com\/docs" target="_blank" rel="noopener noreferrer"/);
  // Read-only viewers get a disabled checkbox and no edit controls.
  const readOnly = renderToStaticMarkup(createElement(ModulePage, { view: manifest.views[0], records, labels }));
  assert.match(readOnly, /type="checkbox"[^>]*disabled=""/);
  assert.equal(readOnly.includes(">Edit<"), false);
});

test("content modules convert to page packages: every block is records, state preserved", () => {
  const preset = structuredClone(CUSTOM_MODULE_PRESETS[0]);
  preset.blocks[0].items[0].done = true;
  preset.category = "Delivery";
  const { manifest, records, settings } = convertContentModule(preset);
  assert.equal(manifest.id, "release");
  assert.equal(manifest.engine.minVersion, "1.1.0");
  assert.deepEqual(manifest.permissions, ["module-data:read", "module-data:write"]);
  assert.equal(manifest.views.length, 1);
  assert.equal(manifest.views[0].type, "page");
  assert.deepEqual(manifest.views[0].blocks.map((block) => block.type), ["checklist", "notes"]);
  assert.equal(records.find((record) => record.values.label === "Tests pass")?.values.done, true);
  assert.equal(records.filter((record) => record.entity === "checklist-1").length, 3);
  assert.equal(records.find((record) => record.entity === "notes-2")?.values.text, preset.blocks[1].text);
  assert.deepEqual(settings, { category: "Delivery" });
  assert.throws(() => convertContentModule({ ...preset, blocks: [] }));
  assert.equal(legacyModuleId("notes", new Set()), "notes");
  assert.equal(legacyModuleId("notes", new Set(["notes"])), "notes-page");
  assert.equal(legacyModuleId("notes", new Set(["notes", "notes-page"])), null);
});

test("page views: block references and engine version are validated", () => {
  const { manifest } = convertContentModule(CUSTOM_MODULE_PRESETS[1]);
  assert.equal(moduleManifestSchema.safeParse({ ...manifest, engine: { minVersion: "1.0.0" } }).success, false, "page views need engine 1.1");
  const wrongEntity = structuredClone(manifest);
  wrongEntity.views[0].blocks[1] = { ...wrongEntity.views[0].blocks[1], entity: "missing" };
  assert.equal(moduleManifestSchema.safeParse(wrongEntity).success, false);
  const wrongType = structuredClone(manifest);
  const checklist = wrongType.views[0].blocks.find((block) => block.type === "checklist");
  checklist.doneField = checklist.labelField;
  assert.equal(moduleManifestSchema.safeParse(wrongType).success, false, "checklist done must be a boolean field");
  assert.equal(moduleManifestSchema.safeParse({ ...manifest, views: [{ id: "page", name: "Page", type: "page", blocks: [] }] }).success, false, "a page needs a block");
});

test("url fields accept only absolute http(s) addresses and render them as isolated links", () => {
  const { manifest, records } = convertContentModule(CUSTOM_MODULE_PRESETS[1]);
  const links = records.find((record) => record.entity.startsWith("links-"));
  for (const url of ["javascript:alert(1)", "data:text/html,x", "/relative", "ftp://example.com", `https://example.com/${"x".repeat(2000)}`]) {
    assert.throws(() => parseModuleRecords(manifest, [{ ...links, values: { ...links.values, url } }]), undefined, url);
  }
  const table = { id: "all", name: "All", type: "table", entity: links.entity, fields: ["label", "url"] };
  const html = renderToStaticMarkup(createElement(ModuleView, { manifest: { ...manifest, views: [table] }, view: table, records: [links], labels: { empty: "", yes: "", no: "", ungrouped: "", unscheduled: "", edit: "", remove: "", actions: "", count: "" } }));
  assert.match(html, /<a href="https:\/\/useguidon.com\/developers" target="_blank" rel="noopener noreferrer"/);
});

console.log(`${passed} test groups passed`);

{
  const base = { version: 1, id: "notes", title: "Notes", blocks: [{ type: "text", title: "Intro", text: "Hello" }] };
  assert.equal(customModuleSchema.parse({ ...base, category: " Marketing " }).category, "Marketing");
  assert.equal(customModuleSchema.parse(base).category, undefined);
  assert.equal(customModuleSchema.safeParse({ ...base, category: "" }).success, false);
  assert.equal(customModuleSchema.safeParse({ ...base, category: "x".repeat(41) }).success, false);
  console.log("pass content module category: optional, trimmed, 1-40 characters");
}
