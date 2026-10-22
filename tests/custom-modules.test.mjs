let passed = 0;
function test(name, check) { check(); passed++; console.log(`pass ${name}`); }
import assert from "node:assert/strict";
import { CUSTOM_MODULE_PRESETS, customModuleSchema, customModulesSchema } from "../src/lib/work/custom-modules.ts";

test("presets survive JSON export/import with checklist state", () => {
  const modules = structuredClone(CUSTOM_MODULE_PRESETS);
  modules[0].blocks[0].items[0].done = true;
  assert.deepEqual(customModulesSchema.parse(JSON.parse(JSON.stringify(modules))), modules);
});
test("rejects executable links and malformed URLs without throwing", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "not a url"]) {
    const module = { ...CUSTOM_MODULE_PRESETS[1], blocks: [{ type: "links", title: "Links", items: [{ label: "Link", url }] }] };
    assert.equal(customModuleSchema.safeParse(module).success, false);
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

console.log(`${passed} test groups passed`);
