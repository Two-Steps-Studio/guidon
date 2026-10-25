import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/lib/work/') && /^\.\\/module-[a-z-]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}`)}`, import.meta.url);
const { validateModulePreview, modulePreviewRecords } = await import("../src/lib/work/module-preview.ts");
const example = JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning.json", import.meta.url), "utf8"));
const original = JSON.stringify(example);
const result = validateModulePreview(example);
assert.deepEqual(result.issues, []);
const records = modulePreviewRecords(result.manifest);
assert.equal(records.length, 3);
assert.deepEqual(modulePreviewRecords(result.manifest), records);
assert.equal(JSON.stringify(example), original);
assert.deepEqual(validateModulePreview({ ...example, engine: { minVersion: "2.0.0" } }).issues.map(i=>i.code), ["engine"]);
assert.ok(validateModulePreview({ ...example, permissions: ["tasks:write"] }).issues.some(i=>i.code==="permissions"));
assert.ok(validateModulePreview({ ...example, permissions: ["module-data:read"] }).issues.some(i=>i.code==="write"));
assert.ok(validateModulePreview({ ...example, views: [{ ...example.views[0], fields: ["missing"] }] }).issues.some(i=>i.code==="schema"));
assert.equal(validateModulePreview({ ...example, dependencies: ["remote-api"] }).manifest, null);
assert.equal(validateModulePreview({ ...example, script: "throw new Error()" }).manifest, null);
assert.ok(validateModulePreview({ ...example, entities: [], views: [] }).issues.some(i=>i.code==="entities"));
const edge = validateModulePreview({ ...example, entities: [{ id:"row",name:"Rows",fields:[{ id:"text",name:"Long label",type:"text",required:true,maxLength:1 },{id:"number",name:"Number",type:"number",min:100,max:100},{id:"flag",name:"Flag",type:"boolean"}]}], views:[{id:"rows",name:"Rows",entity:"row",type:"table",fields:["text","number","flag"]}] });
assert.deepEqual(edge.issues, []);
for (const row of modulePreviewRecords(edge.manifest)) { assert.equal(row.values.text.length, 1); assert.equal(row.values.number, 100); }
console.log("pass preview: deterministic synthetic data, field constraints, permissions, runtime versions, invalid refs, dependency/code rejection and no input mutation");
