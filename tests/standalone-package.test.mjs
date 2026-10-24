import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, access, symlink, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { sanitizeStandalone } from "../scripts/standalone-package.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "guidon-package-test-"));
try {
  await assert.rejects(sanitizeStandalone(root));
  assert.equal((await sanitizeStandalone(root, {allowMissing:true})).mode, "platform-managed");
  const target = path.join(root, ".next/standalone");
  await mkdir(target, {recursive:true});
  await writeFile(path.join(root, ".env"), "SOURCE_CANARY=untouched\n");
  for (const name of [".env", ".env.production", ".env.local"]) await writeFile(path.join(target, name), "GENERATED_CANARY=remove\n");
  await writeFile(path.join(target, "server.js"), "// keep server");
  assert.deepEqual(await sanitizeStandalone(root), {mode:"standalone", removed:3});
  assert.equal(await readFile(path.join(root, ".env"), "utf8"), "SOURCE_CANARY=untouched\n");
  await access(path.join(target, "server.js"));
  await assert.rejects(access(path.join(target, ".env")));
  await mkdir(path.join(target, "storage"));
  await assert.rejects(sanitizeStandalone(root), /forbidden/);
  await rmdir(path.join(target, "storage"));
  await rm(target, {recursive:true});
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, ".env"), "OUTSIDE_CANARY=untouched\n");
  await symlink(outside, target, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(sanitizeStandalone(root), /redirected/);
  assert.equal(await readFile(path.join(outside, ".env"), "utf8"), "OUTSIDE_CANARY=untouched\n");
  console.log("pass standalone configuration cleanup, source preservation, forbidden artifacts and redirected-output rejection");
} finally {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("guidon-package-test-")) throw new Error("Unsafe test cleanup path");
  await rm(resolved, {recursive:true, force:true});
}
