#!/usr/bin/env node
/**
 * Self-hosted password reset - there is no email on a self-hosted install, so
 * whoever runs the server resets a forgotten password:
 *
 *   docker compose exec app node scripts/reset-password.mjs user@example.com
 *
 * Sets a new random password for that account and prints it once; the person
 * signs in with it. Same hash format as src/lib/auth/local-auth.ts
 * (scrypt:<salt hex>:<hash hex>, 64-byte key). Needs DATABASE_URL (set in the
 * app container by docker-compose.yml).
 */
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scrypt = promisify(scryptCallback);
const email = (process.argv[2] ?? "").trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/reset-password.mjs <email>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set - run this inside the app container (docker compose exec app ...).");
  process.exit(1);
}

// 18 random bytes as base64url: 24 characters, no ambiguity about quoting.
const password = randomBytes(18).toString("base64url");
const salt = randomBytes(16);
const hash = await scrypt(password, salt, 64);
const stored = `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query("UPDATE auth.users SET encrypted_password = $1 WHERE lower(email) = $2 RETURNING id", [stored, email]);
  if (result.rowCount === 0) {
    console.error(`No account with the email ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(`New password for ${email}: ${password}`);
    console.log("Give it to them privately; they can sign in with it right away.");
  }
} finally {
  await client.end();
}
