import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { assertionClientId, verifyClientAssertion } from '../../src/lib/oauth/client-assertion.ts';

const clientId = 'https://chatgpt.com/oauth/client.json';
const audience = 'https://useguidon.com/oauth/token';
const now = new Date('2026-10-21T12:00:00Z');
const epoch = now.getTime() / 1000;
const { privateKey, publicKey } = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(publicKey), kid: 'client-key', alg: 'RS256', use: 'sig' };
const jwks = { keys: [publicJwk] };
const base = { iss: clientId, sub: clientId, aud: audience, iat: epoch, exp: epoch + 120, jti: 'one-use' };
async function sign(claims = {}, key = privateKey, alg = 'RS256') {
  return new SignJWT({ ...base, ...claims }).setProtectedHeader({ alg, kid: 'client-key' }).sign(key);
}
async function verifies(assertion, overrides = {}) {
  return verifyClientAssertion({ assertion, clientId, audience: [audience, 'https://useguidon.com'], jwks, now, consume: async () => true, ...overrides });
}

test('valid signature, issuer, subject, audience and freshness authenticate', async () => {
  assert.equal(await verifies(await sign()), true);
  assert.equal(await verifies(await sign({ aud: 'https://useguidon.com' })), true);
});
test('ES256 keys used by web clients work too', async () => {
  const keys = await generateKeyPair('ES256');
  const ecJwk = { ...await exportJWK(keys.publicKey), kid: 'client-key', alg: 'ES256' };
  assert.equal(await verifies(await sign({}, keys.privateKey, 'ES256'), { jwks: { keys: [ecJwk] } }), true);
});
test('a client assertion without a form client_id can provide a lookup hint', async () => {
  assert.equal(assertionClientId(await sign()), clientId);
  assert.equal(assertionClientId('invalid'), '');
  assert.equal(assertionClientId('x'.repeat(17000)), '');
});
test('untrusted signing keys cannot impersonate a metadata client', async () => {
  const other = await generateKeyPair('RS256');
  assert.equal(await verifies(await sign({}, other.privateKey)), false);
});
test('issuer, subject and audience are each bound to the client and server', async () => {
  for (const claims of [{ iss: 'https://evil.example/client' }, { sub: 'another-client' }, { aud: 'https://evil.example/token' }]) {
    assert.equal(await verifies(await sign(claims)), false);
  }
});
test('missing claims, expired, future and overlong assertions fail', async () => {
  for (const claims of [
    { exp: epoch - 60 }, { iat: epoch + 120, exp: epoch + 240 },
    { exp: epoch + 301 }, { iat: undefined }, { exp: undefined },
    { jti: undefined }, { jti: '' }, { jti: 'x'.repeat(201) },
  ]) assert.equal(await verifies(await sign(claims)), false);
  assert.equal(await verifies('x'.repeat(17000)), false);
});
test('unsigned and HMAC assertions are never accepted', async () => {
  const hmac = await sign({}, new Uint8Array(32), 'HS256');
  assert.equal(await verifies(hmac), false);
  const unsigned = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(base)).toString('base64url') + '.';
  assert.equal(await verifies(unsigned), false);
});
test('replays and concurrent attempts use one atomic consume operation', async () => {
  const seen = new Set();
  const consume = async (jti, expiresAt) => {
    assert.equal(expiresAt.getTime(), (epoch + 150) * 1000);
    if (seen.has(jti)) return false;
    seen.add(jti);
    return true;
  };
  const signed = await sign();
  const results = await Promise.all([verifies(signed, { consume }), verifies(signed, { consume })]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await verifies(signed, { consume }), false);
});
test('invalid signatures do not consume a replay key; storage errors fail closed', async () => {
  let calls = 0;
  assert.equal(await verifies(await sign({ sub: 'wrong' }), { consume: async () => { calls++; return true; } }), false);
  assert.equal(calls, 0);
  assert.equal(await verifies(await sign(), { consume: async () => { throw Error('database unavailable'); } }), false);
});
