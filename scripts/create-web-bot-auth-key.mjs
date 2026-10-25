#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const secret = args[1] ?? "WEB_BOT_AUTH_PRIVATE_KEY";
if (args.length < 1 || args.length > 2 || args[0].startsWith("-") || !["WEB_BOT_AUTH_PRIVATE_KEY", "AGENT_AUTH_PRIVATE_KEY"].includes(secret)) {
  console.error("Usage: node scripts/create-web-bot-auth-key.mjs <private-output-file> [WEB_BOT_AUTH_PRIVATE_KEY|AGENT_AUTH_PRIVATE_KEY]");
  process.exit(1);
}
const file = resolve(args[0]);
const key = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
const now = Math.floor(Date.now() / 1000);
try {
  // Exclusive creation avoids overwriting an existing key or following a
  // pre-existing symlink. POSIX permissions do not replace Windows ACLs.
  writeFileSync(file, JSON.stringify({ ...key, nbf: now, exp: now + 365 * 86400 }) + "\n", { flag: "wx", mode: 0o600 });
  console.log(`Private JWK saved to ${file}. Its value was not printed.`);
  console.log(`Store it in the deployment secret ${secret}, then remove the local copy securely. Never commit it.`);
} catch {
  console.error("Could not create the private key file. Use a new filename in an existing private directory.");
  process.exitCode = 1;
}
