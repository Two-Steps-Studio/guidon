import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { moduleManifestSchema } from "../src/lib/work/module-manifest.ts";
import { parseModuleRecords, parseModuleSettings } from "../src/lib/work/module-records.ts";
import { hasExactModuleConsent } from "../src/lib/work/module-installation.ts";

// Match the app's bundler resolution for these local TS modules under Node's
// type-stripping runner, without changing production compiler settings.
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/lib/work/') && /^\.\\/module-[a-z-]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}`)}`, import.meta.url);
const { prepareModuleChange } = await import("../src/lib/work/module-lifecycle.ts");

const manifest = moduleManifestSchema.parse(JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning.json", import.meta.url), "utf8")));
const records = JSON.parse(await readFile(new URL("../examples/module-manifests/release-planning-data.json", import.meta.url), "utf8"));
const before = JSON.stringify(records);
const upgraded = structuredClone(manifest);
upgraded.version = "1.1.0";
upgraded.entities[0].fields.push({ id:"notes",name:"Notes",type:"text",required:false });
assert.deepEqual(parseModuleRecords(upgraded,records),records);
assert.deepEqual(parseModuleRecords(manifest,records),records);
assert.equal(JSON.stringify(records),before);
console.log("pass compatible upgrade/rollback validates current records without changing data");

const breaking = structuredClone(upgraded);
breaking.entities[0].fields.find((field) => field.id === "notes").required = true;
assert.throws(() => parseModuleRecords(breaking,records));
const deleted = structuredClone(manifest);
deleted.entities[0].fields = deleted.entities[0].fields.filter((field) => field.id !== "due");
assert.throws(() => parseModuleRecords(deleted,records));
const removedOption = structuredClone(manifest);
removedOption.entities[0].fields.find((field) => field.id === "status").options = [{value:"shipped",label:"Shipped"}];
assert.throws(() => parseModuleRecords(removedOption,records));
console.log("pass required-field additions, removed stored fields and removed selection values block unsafe version changes");

assert.equal(hasExactModuleConsent(upgraded,["module-data:read"]),false);
assert.equal(hasExactModuleConsent(upgraded,upgraded.permissions),true);
const defaultView = manifest.views[0].id;
assert.deepEqual(parseModuleSettings(manifest,{defaultView}),{defaultView});
assert.throws(() => parseModuleSettings(manifest,{defaultView:"unknown-view"}));
assert.throws(() => parseModuleSettings(manifest,{script:"alert(1)"}));
console.log("pass permission changes require full consent and settings are restricted to declared views");

const current = { moduleId: manifest.id, manifest, records, revision: 7, enabled: true, installed: true, settings: { defaultView } };
function form(command, fields = {}, permissions = manifest.permissions) {
  const input = new FormData();
  for (const [key, value] of Object.entries({ revision: "7", command, ...fields })) input.set(key, value);
  for (const permission of permissions) input.append("permissions", permission);
  return input;
}
const change = (input, release = null, value = current) => prepareModuleChange(value, "installed-digest", "org-a", input, release);
const archive = change(form("uninstall"));
assert.deepEqual(archive, { error: null, patch: { revision: 8, installed: false, enabled: false } });
const archived = { ...current, ...archive.patch };
assert.equal(change(form("enable", { revision: "8" }), null, archived).error, "conflict");
assert.equal(change(form("restore", { revision: "8" }), null, archived).error, "consent");
assert.equal(change(form("restore", { revision: "8", approve: "on", digest: "changed" }), null, archived).error, "consent");
assert.deepEqual(change(form("restore", { revision: "8", approve: "on", digest: "installed-digest" }), null, archived), { error: null, patch: { revision: 9, installed: true, enabled: true } });
assert.equal(change(form("disable", { revision: "6" })).error, "conflict");
assert.equal(change(form("uninstall", { revision: "2147483647" }), null, { ...current, revision: 2147483647 }).error, "conflict");
assert.equal(change(form("unknown")).error, "invalid");
assert.equal(change(form("settings", { defaultView: "unknown" })).error, "invalid");
assert.deepEqual(change(form("settings", { defaultView })), { error: null, patch: { revision: 8, settings: { defaultView } } });
console.log("pass lifecycle commands guard revisions, require restore consent and never return data or identity writes");

const release = { manifest: upgraded, digest: "release-digest", organizationId: null };
const replacement = (fields = {}, permissions = upgraded.permissions) => form("replace", { targetVersion: upgraded.version, approve: "on", digest: release.digest, ...fields }, permissions);
const upgradedResult = change(replacement(), release);
assert.equal(upgradedResult.error, null);
assert.equal(Object.hasOwn(upgradedResult.patch, "records"), false);
assert.deepEqual({ ...current, ...upgradedResult.patch }.records, records);
assert.equal(change(replacement(), null).error, "permission");
assert.equal(change(replacement(), { ...release, organizationId: "org-b" }).error, "permission");
assert.equal(change(replacement({ digest: "outdated" }), release).error, "conflict");
assert.equal(change(replacement({ approve: "" }), release).error, "consent");
assert.equal(change(replacement({}, ["module-data:read"]), release).error, "consent");
assert.equal(change(replacement(), { ...release, manifest: breaking }).error, "incompatibleData");
assert.equal(change(replacement(), { ...release, manifest: { ...upgraded, engine: { minVersion: "99.0.0" } } }).error, "unsupported");
assert.equal(change(replacement(), { ...release, manifest: { ...upgraded, permissions: ["tasks:read"] } }).error, "unsupported");
const rolledBack = prepareModuleChange({ ...current, manifest: upgraded }, "digest", "org-a", form("replace", { targetVersion: manifest.version, digest: "old-release", approve: "on" }), { manifest, digest: "old-release", organizationId: null });
assert.equal(rolledBack.error, null);
assert.equal(Object.hasOwn(rolledBack.patch, "records"), false);
const withoutDefault = { ...upgraded, views: upgraded.views.filter((view) => view.id !== defaultView) };
assert.deepEqual(change(replacement(), { ...release, manifest: withoutDefault }).patch.settings, {});
assert.equal(JSON.stringify(records), before);
console.log("pass update/rollback enforce exact consent, reviewed artifact, source organization, runtime and data compatibility");

assert.deepEqual(parseModuleSettings(manifest, { category: "Marketing" }), { category: "Marketing" });
assert.deepEqual(parseModuleSettings(manifest, { category: "  Ops  ", defaultView }), { category: "Ops", defaultView });
assert.throws(() => parseModuleSettings(manifest, { category: "" }));
assert.throws(() => parseModuleSettings(manifest, { category: "x".repeat(41) }));
const categorized = change(form("settings", { defaultView, category: " Release " }));
assert.deepEqual(categorized.patch.settings, { defaultView, category: "Release" });
assert.deepEqual(change(form("settings", { defaultView: "", category: "" })).patch.settings, {});
const withCategory = { ...current, settings: { defaultView, category: "Release" } };
assert.deepEqual(change(replacement(), release, withCategory).patch.settings, { defaultView, category: "Release" });
assert.deepEqual(change(replacement(), { ...release, manifest: withoutDefault }, withCategory).patch.settings, { category: "Release" });
console.log("pass module category: trimmed, 1-40 characters, saved with settings and kept across version changes");
