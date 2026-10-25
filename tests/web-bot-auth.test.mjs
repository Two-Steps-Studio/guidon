import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { parseSigningKey, signingKeyFromEnv } from "../src/lib/web-bot-auth.ts";

const jwk = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
await test("signing configuration rejects malformed and mismatched keys without throwing", () => {
  for (const value of [null, [], 7, "text", {}, { ...jwk, d: "bad" }, { ...jwk, x: "bad" }, { ...jwk, nbf: "0" }, { ...jwk, exp: 1.5 }, { ...jwk, nbf: 2, exp: 1 }, { ...jwk, x: generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x }]) {
    assert.equal(parseSigningKey(JSON.stringify(value)), null);
  }
  assert.equal(parseSigningKey(JSON.stringify(jwk)).publicJwk.x, jwk.x);
});

await test("only currently active keys are used for outgoing signatures and discovery", () => {
  const previous = process.env.WEB_BOT_AUTH_PRIVATE_KEY;
  const now = Math.floor(Date.now() / 1000);
  try {
    for (const [nbf, exp, active] of [[now - 60, now + 60, true], [now + 60, now + 120, false], [now - 60, now, false]]) {
      process.env.WEB_BOT_AUTH_PRIVATE_KEY = JSON.stringify({ ...jwk, nbf, exp });
      assert.equal(signingKeyFromEnv() !== null, active);
    }
  } finally {
    if (previous === undefined) delete process.env.WEB_BOT_AUTH_PRIVATE_KEY;
    else process.env.WEB_BOT_AUTH_PRIVATE_KEY = previous;
  }
});

await test("key generator does not print private material or overwrite an existing file", () => {
  const directory = mkdtempSync(join(tmpdir(), "guidon-signing-test-"));
  const file = join(directory, "private.jwk");
  try {
  const result = spawnSync(process.execPath, ["scripts/create-web-bot-auth-key.mjs", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const raw = readFileSync(file, "utf8");
  const key = parseSigningKey(raw);
  assert.ok(key);
  assert.ok(!result.stdout.includes(key.privateJwk.d));
  assert.equal(key.publicJwk.exp - key.publicJwk.nbf, 365 * 86400);
  assert.equal(spawnSync(process.execPath, ["scripts/create-web-bot-auth-key.mjs", file]).status, 1);
  assert.equal(readFileSync(file, "utf8"), raw);
  } finally {
    unlinkSync(file);
    rmdirSync(directory);
  }
});
