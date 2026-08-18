#!/usr/bin/env node
/**
 * Proves the crypto primitives behind self-hosted auth actually round-trip:
 * password hashing (src/lib/auth/local-auth.ts) and signed session cookies
 * (src/lib/auth/session-cookie.ts).
 *
 *   npm run test:auth
 *
 * No database, no Next.js runtime — this file mirrors the two modules'
 * algorithms exactly (same pattern as tests/db/compat.test.mjs mirroring
 * src/lib/db/session.ts), because plain `node *.mjs` here has no loader for
 * the `@/` path alias or "server-only"/"next/headers" imports those modules
 * carry. If either source file's algorithm changes, change this too.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

let pass = 0;
let fail = 0;

function check(label, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`    pass  ${label}`);
  } else {
    fail++;
    console.log(`    FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n  ${title}`);
}

// ============================================================
// Mirrors src/lib/auth/local-auth.ts's hashPassword/verifyPassword
// ============================================================

const scrypt = promisify(scryptCallback);
const SCRYPT_KEYLEN = 64;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const actual = await scrypt(password, salt, expected.length || SCRYPT_KEYLEN);
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

// ============================================================
// Mirrors src/lib/auth/session-cookie.ts
// ============================================================

const AUTH_SECRET = "test-secret-do-not-use-in-production-0123456789";
const OTHER_SECRET = "a-completely-different-secret-9876543210";

function encoderInstance() {
  return new TextEncoder();
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return Buffer.from(binary, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoderInstance().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSession(userId, secret, expiresInSeconds) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = { sub: userId, exp };
  const payloadB64 = toBase64Url(encoderInstance().encode(JSON.stringify(payload)));

  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoderInstance().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(signature));

  return `${payloadB64}.${sigB64}`;
}

async function verifySessionCookie(cookieValue, secret) {
  if (!cookieValue) return null;

  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  let signatureBytes;
  try {
    signatureBytes = fromBase64Url(sigB64);
  } catch {
    return null;
  }

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoderInstance().encode(payloadB64));
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }

  if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload.sub;
}

// ============================================================
// PASSWORD HASHING
// ============================================================

async function testPasswordHashing() {
  section("hashowanie hasel (scrypt)");

  const hash = await hashPassword("correct horse battery staple");
  check("hash ma format scrypt:salt:hash", /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash), hash);

  check("poprawne haslo weryfikuje sie", await verifyPassword("correct horse battery staple", hash));
  check("bledne haslo nie weryfikuje sie", !(await verifyPassword("wrong password", hash)));
  check("puste haslo nie weryfikuje sie", !(await verifyPassword("", hash)));

  const hash2 = await hashPassword("correct horse battery staple");
  check("dwa hashe tego samego hasla roznia sie (losowa sol)", hash !== hash2);
  check("drugi hash tez poprawnie weryfikuje", await verifyPassword("correct horse battery staple", hash2));

  check("uszkodzony format zwraca false, nie rzuca wyjatku", !(await verifyPassword("x", "not-a-valid-hash")));
  check("nieznany prefiks algorytmu odrzucony", !(await verifyPassword("x", "md5:aa:bb")));
}

// ============================================================
// SESSION COOKIES
// ============================================================

async function testSessionCookies() {
  section("podpisane ciasteczka sesji (HMAC-SHA256)");

  const userId = "11111111-1111-1111-1111-111111111111";
  const cookie = await signSession(userId, AUTH_SECRET, 3600);

  check("swiezo podpisana sesja weryfikuje sie", (await verifySessionCookie(cookie, AUTH_SECRET)) === userId);

  const [payloadPart, sigPart] = cookie.split(".");
  const tamperedPayload = `${payloadPart}x.${sigPart}`;
  check("zmieniony payload odrzucony", (await verifySessionCookie(tamperedPayload, AUTH_SECRET)) === null);

  const tamperedSig = `${payloadPart}.${sigPart.slice(0, -2)}xx`;
  check("zmieniony podpis odrzucony", (await verifySessionCookie(tamperedSig, AUTH_SECRET)) === null);

  check("zly sekret odrzucony", (await verifySessionCookie(cookie, OTHER_SECRET)) === null);

  const expired = await signSession(userId, AUTH_SECRET, -60);
  check("wygasla sesja odrzucona", (await verifySessionCookie(expired, AUTH_SECRET)) === null);

  check("brak ciasteczka zwraca null, nie rzuca", (await verifySessionCookie(undefined, AUTH_SECRET)) === null);
  check("pusty string odrzucony", (await verifySessionCookie("", AUTH_SECRET)) === null);
  check("losowy smiec odrzucony", (await verifySessionCookie("not.a.valid.cookie.at.all", AUTH_SECRET)) === null);
  check("brak kropki odrzucony", (await verifySessionCookie("noDotHere", AUTH_SECRET)) === null);

  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const otherCookie = await signSession(otherUserId, AUTH_SECRET, 3600);
  check(
    "dwie sesje roznych userow nie mieszaja sie",
    (await verifySessionCookie(cookie, AUTH_SECRET)) === userId &&
      (await verifySessionCookie(otherCookie, AUTH_SECRET)) === otherUserId
  );
}

async function main() {
  await testPasswordHashing();
  await testSessionCookies();

  console.log(`\n  ${pass} pass / ${fail} fail\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
