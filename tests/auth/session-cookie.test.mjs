// Import the production verifier directly; react-server resolves the existing
// server-only marker to its intended empty module, without copying algorithms.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signSession, verifySessionCookie } from "../../src/lib/auth/session-cookie.ts";

const originalSecret = process.env.AUTH_SECRET;
const originalNow = Date.now;
try {
  process.env.AUTH_SECRET = "isolated-session-test-secret-not-for-production";
  Date.now = () => 1800000000000;
  const now = Math.floor(Date.now() / 1000);
  const userId = "11111111-1111-1111-1111-111111111111";
  function cookie(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${data}.${createHmac("sha256",process.env.AUTH_SECRET).update(data).digest("base64url")}`;
  }
  assert.equal(await verifySessionCookie((await signSession(userId)).value),userId);
  for (const exp of [now-1,now]) assert.equal(await verifySessionCookie(cookie({sub:userId,exp})),null);
  assert.equal(await verifySessionCookie(cookie({sub:userId,exp:now+1})),userId);
  for (const payload of [{sub:userId},{sub:userId,exp:"future"},{sub:null,exp:now+60}]) assert.equal(await verifySessionCookie(cookie(payload)),null);
  const valid=cookie({sub:userId,exp:now+60});
  const [,signature]=valid.split(".");
  const foreign=Buffer.from(JSON.stringify({sub:"22222222-2222-2222-2222-222222222222",exp:now+60})).toString("base64url");
  assert.equal(await verifySessionCookie(`${foreign}.${signature}`),null);
  for(const input of [undefined,"","bad","a.!!!"])assert.equal(await verifySessionCookie(input),null);
  process.env.AUTH_SECRET="another-isolated-secret";
  assert.equal(await verifySessionCookie(valid),null);
  console.log("pass production session verifier: exact expiry boundary, valid signature, malformed claims, tampering and secret rotation");
} finally {
  Date.now=originalNow;
  if(originalSecret===undefined)delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET=originalSecret;
}
