import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { importJWK, SignJWT } from "jose";
import { agentSigningKey, claimEmailHash, createClaimSecrets, hashClaimSecret, mintAgentAssertion, verifyAgentAssertion } from "../../src/lib/oauth/agent-claims-core.ts";
import { authorizationServerMetadata, authMarkdown } from "../../src/lib/oauth/oauth-core.ts";

const issuer = "https://guidon.test";
const id = "11111111-1111-4111-8111-111111111111";
const key = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
const previous = process.env.AGENT_AUTH_PRIVATE_KEY;
process.env.AGENT_AUTH_PRIVATE_KEY = JSON.stringify(key);
try {
  await test("high-entropy handles, numeric handoff code and normalized hash-only email binding", () => {
    const first = createClaimSecrets();
    const second = createClaimSecrets();
    assert.match(first.claimToken, /^clm_[\w-]{43}$/);
    assert.match(first.attemptToken, /^cat_[\w-]{43}$/);
    assert.match(first.userCode, /^\d{6}$/);
    assert.notEqual(first.claimToken, second.claimToken);
    assert.notEqual(first.claimToken, first.attemptToken);
    assert.equal(claimEmailHash(" Alice@Example.com "), claimEmailHash("alice@example.com"));
    assert.match(hashClaimSecret(first.claimToken), /^[a-f0-9]{64}$/);
  });
  await test("only the enabled service_auth profile is advertised, without anonymous or provider assertions", () => {
    assert.equal(authorizationServerMetadata(issuer).agent_auth, undefined);
    const enabled = authorizationServerMetadata(issuer, true);
    assert.deepEqual(enabled.agent_auth.identity_types_supported, ["service_auth"]);
    assert.equal(enabled.agent_auth.identity_endpoint, `${issuer}/oauth/agent/identity`);
    assert.equal(enabled.agent_auth.claim_endpoint, undefined);
    assert.equal(enabled.agent_auth.events_endpoint, undefined);
    assert.ok(authMarkdown(issuer, true).includes("grant_type=urn:workos:agent-auth:grant-type:claim"));
    assert.ok(!authMarkdown(issuer).includes("## Headless agent registration"));
  });
  await test("a signed service assertion is bound to this issuer and registration", async () => {
    const assertion = await mintAgentAssertion(id, issuer, new Date(Date.now() + 3600000).toISOString());
    assert.equal(await verifyAgentAssertion(assertion, issuer), id);
    assert.equal(await verifyAgentAssertion(assertion, `${issuer}/`), null);
    assert.equal(await verifyAgentAssertion(assertion, "https://other.test"), null);
    assert.equal(await verifyAgentAssertion(assertion + "x", issuer), null);
  });
  await test("wrong key, JWT type, audience, expiry, missing claims and overlong assertions fail closed", async () => {
    const now = Math.floor(Date.now() / 1000);
    const signing = agentSigningKey();
    const base = { sub: id, iss: issuer, aud: issuer, iat: now, exp: now + 300, jti: "test-jti" };
    const signed = async (claims = {}, header = {}, jwk = key) => new SignJWT({ ...base, ...claims })
      .setProtectedHeader({ alg: "EdDSA", typ: "oauth-id-jag+jwt", kid: signing.publicJwk.kid, ...header })
      .sign(await importJWK(jwk, "EdDSA"));
    for (const claims of [{ exp: now - 1 }, { aud: "https://other.test" }, { aud: [issuer,"https://other.test"] }, { iss: "https://other.test" }, { iat: now + 100 }, { iat:"bad" }, { exp: now + 90000 }, { jti: undefined }, { jti:"" }, { sub: "not-a-uuid" }]) {
      assert.equal(await verifyAgentAssertion(await signed(claims), issuer), null);
    }
    assert.equal(await verifyAgentAssertion(await signed({}, { typ: "JWT" }), issuer), null);
    assert.equal(await verifyAgentAssertion(await signed({}, { kid: "other" }), issuer), null);
    assert.equal(await verifyAgentAssertion(await signed({}, {}, generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" })), issuer), null);
    assert.equal(await verifyAgentAssertion("x".repeat(17000), issuer), null);
    const hmac = await new SignJWT(base).setProtectedHeader({alg:"HS256",typ:"oauth-id-jag+jwt"}).sign(new Uint8Array(32));
    assert.equal(await verifyAgentAssertion(hmac,issuer),null);
  });
} finally {
  if (previous === undefined) delete process.env.AGENT_AUTH_PRIVATE_KEY;
  else process.env.AGENT_AUTH_PRIVATE_KEY = previous;
}
