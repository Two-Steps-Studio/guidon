import assert from "node:assert/strict";
import { test } from "node:test";
import { adminSessionProof, adminSsoProvider } from "../src/lib/admin/session-policy.ts";
import { resolveAdminRole } from "../src/lib/admin/permissions.ts";

const provider = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const claims = {
  sub: userId, role: "authenticated", session_id: sessionId, aal: "aal2",
  amr: [{ method: "totp" }, { method: "sso/saml", provider }],
};

test("requires the expected SAML provider on the current user's session", () => {
  assert.deepEqual(adminSessionProof(claims, userId, provider), { sessionId, mfaVerified: true });
  assert.equal(adminSessionProof(claims, provider, provider), null);
  assert.equal(adminSessionProof(claims, userId, userId), null);
  assert.equal(adminSessionProof({ ...claims, session_id: null }, userId, provider), null);
  assert.equal(adminSessionProof({ ...claims, amr: [{ method: "oauth" }], user_metadata: { provider } }, userId, provider), null);
  assert.equal(adminSsoProvider("poczta.fm"), null);
});

test("requires both AAL2 and TOTP for an admin session", () => {
  assert.equal(adminSessionProof({ ...claims, aal: "aal1" }, userId, provider)?.mfaVerified, false);
  assert.equal(adminSessionProof({ ...claims, amr: [claims.amr[1]] }, userId, provider)?.mfaVerified, false);
});

test("SSO still requires an allowlisted account and a role grant", () => {
  assert.equal(resolveAdminRole("sso", true), null);
  assert.equal(resolveAdminRole("sso", false, "super_admin"), null);
  assert.equal(resolveAdminRole("sso", true, "finance"), "finance");
});
