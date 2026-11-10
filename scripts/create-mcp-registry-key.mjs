#!/usr/bin/env node
// Ed25519 key for publishing com.useguidon/* to the official MCP Registry.
//   node scripts/create-mcp-registry-key.mjs <private-output-file>
// Writes the private key (64 hex characters, what `mcp-publisher login http
// --private-key` wants) to the file without printing it, and prints the
// public key for MCP_REGISTRY_PUBLIC_KEY (served at
// /.well-known/mcp-registry-auth). The public key is not a secret.
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [out, ...rest] = process.argv.slice(2);
if (!out || rest.length || out.startsWith("-")) {
  console.error("Usage: node scripts/create-mcp-registry-key.mjs <private-output-file>");
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
// The raw 32-byte seed and public key are the last 32 bytes of their DER forms.
const seedHex = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("hex");
const publicB64 = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
try {
  // No trailing newline: the whole file is pasted into a secret as is.
  writeFileSync(resolve(out), seedHex, { flag: "wx", mode: 0o600 });
} catch {
  console.error("Could not create the private key file. Use a new filename in an existing private directory.");
  process.exit(1);
}
console.log(`Private key saved to ${resolve(out)} (not printed).`);
console.log("1. GitHub > Settings > Environments > mcp-registry: add the secret MCP_REGISTRY_PRIVATE_KEY with the file's contents.");
console.log("2. Vercel (Production): add the environment variable MCP_REGISTRY_PUBLIC_KEY with this value, then redeploy:");
console.log(publicB64);
console.log("3. Delete the local file securely. Never commit it.");
