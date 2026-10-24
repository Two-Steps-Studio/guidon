import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MODULE_MANIFEST_JSON_SCHEMA, moduleManifestSchema } from "../src/lib/work/module-manifest.ts";

let passed = 0;
function test(name, check) {
  check();
  passed++;
  console.log(`pass ${name}`);
}

const example = JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning.json", import.meta.url), "utf8"));

test("the published example validates and defaults permissions to none", () => {
  const parsed = moduleManifestSchema.parse(example);
  assert.deepEqual(parsed.permissions, []);
  const withoutPermissions = { ...example };
  delete withoutPermissions.permissions;
  assert.deepEqual(moduleManifestSchema.parse(withoutPermissions).permissions, []);
});

test("accepts strict SemVer and rejects malformed or ambiguous versions", () => {
  for (const version of ["1.2.3", "0.0.1", "2.4.0-rc.1+build.7"]) {
    assert.equal(moduleManifestSchema.safeParse({ ...example, version }).success, true);
  }
  for (const version of ["v1.2.3", "01.2.3", "1.2", "1.2.3-01"]) {
    assert.equal(moduleManifestSchema.safeParse({ ...example, version }).success, false, version);
  }
});

test("rejects reversed engine ranges and accepts a valid pre-release bound", () => {
  assert.equal(moduleManifestSchema.safeParse({ ...example, engine: { minVersion: "9007199254740992.0.0", maxVersionExclusive: "9007199254740993.0.0" } }).success, true);
  assert.equal(moduleManifestSchema.safeParse({ ...example, engine: { minVersion: "9007199254740993.0.0", maxVersionExclusive: "9007199254740992.0.0" } }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...example, engine: { minVersion: "2.0.0", maxVersionExclusive: "1.9.0" } }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...example, engine: { minVersion: "1.2.3-rc.1", maxVersionExclusive: "1.2.3" } }).success, true);
  assert.equal(moduleManifestSchema.safeParse({ ...example, engine: { minVersion: "1.2.3", maxVersionExclusive: "1.2.3-rc.1" } }).success, false);
});

test("rejects unknown capabilities, duplicate IDs, and undeclared view fields", () => {
  assert.equal(moduleManifestSchema.safeParse({ ...example, permissions: ["network:access"] }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...example, permissions: ["tasks:read", "tasks:read"] }).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...example, entities: [...example.entities, example.entities[0]] }).success, false);
  const invalidView = { ...example, views: [{ ...example.views[0], fields: ["not-declared"] }] };
  assert.equal(moduleManifestSchema.safeParse(invalidView).success, false);
  assert.equal(moduleManifestSchema.safeParse({ ...example, code: "return fetch('https://evil.example')" }).success, false);
});

test("accepts only a complete additive migration chain", () => {
  const upgraded = structuredClone(example);
  upgraded.dataVersion = 2;
  upgraded.entities[0].fields.push({ id: "notes", name: "Notes", type: "text", required: false });
  upgraded.migrations = [{
    fromVersion: 1,
    toVersion: 2,
    operations: [{ op: "add_field", entity: "release", field: { id: "notes", name: "Notes", type: "text", required: false } }],
  }];
  assert.equal(moduleManifestSchema.safeParse(upgraded).success, true);
  assert.equal(moduleManifestSchema.safeParse({ ...upgraded, migrations: [] }).success, false);
  const destructive = structuredClone(upgraded);
  destructive.migrations[0].operations[0] = { op: "remove_field", entity: "release", field: "status" };
  assert.equal(moduleManifestSchema.safeParse(destructive).success, false);
});

test("the checked-in JSON Schema is generated from the structural validator", async () => {
  const committed = JSON.parse(await readFile(new URL("../docs/schemas/module-manifest-v1.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(committed, MODULE_MANIFEST_JSON_SCHEMA);
  assert.equal(committed.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(committed.additionalProperties, false);
});

console.log(`${passed} module manifest test groups passed`);
