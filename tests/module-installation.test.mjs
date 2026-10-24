import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { moduleManifestSchema } from "../src/lib/work/module-manifest.ts";
import { installCatalogModule } from "../src/lib/work/module-installation.ts";

const manifest = moduleManifestSchema.parse(JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning.json", import.meta.url), "utf8")));
const request = { projectId: "project-a", moduleId: manifest.id, version: manifest.version, permissions: manifest.permissions, expectedDigest: "approved-artifact" };
function fixture(overrides = {}) {
  let installed = null;
  let writes = 0;
  return {
    get writes() { return writes; },
    store: {
      async getProject() { return { organizationId: "org-a", canManage: true }; },
      async getEntry() { return { manifest, organizationId: null, compatible: true, digest: request.expectedDigest }; },
      async getExisting() { return installed; },
      async insert(_id, value) { writes++; installed = { manifest: value }; return "created"; },
      ...overrides,
    },
  };
}

const valid = fixture();
assert.deepEqual(await installCatalogModule(request, valid.store), { error: null, existing: false });
assert.deepEqual(await installCatalogModule(request, valid.store), { error: null, existing: true });
assert.equal(valid.writes, 1);
console.log("pass installation retry is idempotent and writes exactly once");

for (const [override, expected] of [
  [{ getProject: async () => null }, "permission"],
  [{ getProject: async () => ({ organizationId: "org-a", canManage: false }) }, "permission"],
  [{ getEntry: async () => null }, "permission"],
  [{ getEntry: async () => ({ manifest, organizationId: "org-b", compatible: true, digest: request.expectedDigest }) }, "permission"],
  [{ getEntry: async () => ({ manifest, organizationId: null, compatible: false, digest: request.expectedDigest }) }, "unsupported"],
  [{ getEntry: async () => ({ manifest, organizationId: null, compatible: true, digest: "changed-artifact" }) }, "conflict"],
  [{ getExisting: async () => ({ manifest: { ...manifest, version: "0.9.0" } }) }, "conflict"],
  [{ insert: async () => "limit" }, "limit"],
  [{ insert: async () => "failed" }, "saveFailed"],
  [{ getProject: async () => { throw new Error("Database unavailable"); } }, "saveFailed"],
]) {
  const f = fixture(override);
  assert.deepEqual(await installCatalogModule(request, f.store), { error: expected });
  assert.equal(f.writes, 0);
}
for (const permissions of [null, [], [manifest.permissions[0]], [...manifest.permissions, "tasks:write"]]) {
  const f = fixture();
  assert.deepEqual(await installCatalogModule({ ...request, permissions }, f.store), { error: "consent" });
  assert.equal(f.writes, 0);
}
console.log("pass roles, source org, compatibility, artifact changes, consent and conflicts reject without partial writes");

for (const race of ["duplicate", "limit"]) {
  let existing = null;
  const f = fixture({
    getExisting: async () => existing,
    insert: async () => { existing = { manifest }; return race; },
  });
  assert.deepEqual(await installCatalogModule(request, f.store), { error: null, existing: true });
}
console.log("pass concurrent duplicate and last-slot installation races resolve to the same installation");

assert.equal(moduleManifestSchema.safeParse({ ...manifest, dependencies: [{ id: "arbitrary", version: "latest" }] }).success, false);
console.log("pass unsupported dependency declarations are rejected by the manifest contract");
