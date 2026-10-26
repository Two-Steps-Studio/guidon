let passed = 0;
function test(name, check) { check(); passed++; console.log(`pass ${name}`); }
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CUSTOM_MODULE_PRESETS, customModuleSchema, customModulesSchema } from "../src/lib/work/custom-modules.ts";
import { renderCustomModuleBlocks } from "../src/lib/work/custom-module-renderer.ts";

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

test("renders module content as escaped text and keeps external links isolated", () => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const candidate = customModuleSchema.parse({
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
  const html = renderToStaticMarkup(createElement("article", null, candidate.title, candidate.description, renderCustomModuleBlocks(candidate, 0, true, false, () => {})));

  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("&lt;img"), true);
  assert.equal(html.includes("&lt;script"), true);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
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
