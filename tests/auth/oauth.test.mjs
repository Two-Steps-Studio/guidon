#!/usr/bin/env node
/**
 * Self-hosted OAuth sign-in's pure parts (src/lib/auth/oauth-local-core.ts):
 * which providers the environment switches on, the signed state cookie and
 * PKCE, and reading each provider's profile - above all, that only a
 * verified email is ever accepted.
 *
 *   npm run test:auth
 */

import { createHash } from "node:crypto";
import {
  codeChallengeFor,
  createCodeVerifier,
  localOAuthProviders,
  normalizeProfile,
  signOAuthState,
  verifyOAuthState,
} from "../../src/lib/auth/oauth-local-core.ts";

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

section("providers come from the environment");
check("nothing configured -> no buttons", localOAuthProviders({}).length === 0);
check("an id without its secret is ignored", localOAuthProviders({ GOOGLE_CLIENT_ID: "x" }).length === 0);
{
  const all = localOAuthProviders({
    GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs",
    GITHUB_OAUTH_CLIENT_ID: "h", GITHUB_OAUTH_CLIENT_SECRET: "hs",
    DISCORD_OAUTH_CLIENT_ID: "d", DISCORD_OAUTH_CLIENT_SECRET: "ds",
    GITLAB_CLIENT_ID: "l", GITLAB_CLIENT_SECRET: "ls", GITLAB_URL: "https://git.example.com/",
    OIDC_CLIENT_ID: "o", OIDC_CLIENT_SECRET: "os", OIDC_ISSUER: "https://id.example.com/realms/x/", OIDC_NAME: "Two Steps Studio",
  });
  check("all five, in order", all.map((p) => p.id).join() === "google,github,discord,gitlab,oidc", all.map((p) => p.id).join());
  check("self-managed GitLab URL, trailing slash trimmed", all[3].authorizeUrl === "https://git.example.com/oauth/authorize", all[3].authorizeUrl);
  check("OIDC named by OIDC_NAME, endpoints left to discovery", all[4].label === "Two Steps Studio" && all[4].authorizeUrl === null && all[4].issuer === "https://id.example.com/realms/x");
}
check("OIDC without an issuer is off", localOAuthProviders({ OIDC_CLIENT_ID: "o", OIDC_CLIENT_SECRET: "s" }).length === 0);
check("the GitHub App's keys don't switch on GitHub sign-in", localOAuthProviders({ GITHUB_APP_CLIENT_ID: "a", GITHUB_APP_CLIENT_SECRET: "b" }).length === 0);

section("PKCE");
{
  const verifier = createCodeVerifier();
  check("verifier is 43 url-safe characters", /^[A-Za-z0-9_-]{43}$/.test(verifier), verifier);
  const expected = createHash("sha256").update(verifier).digest("base64url");
  check("S256 challenge (RFC 7636)", codeChallengeFor(verifier) === expected);
  check("a fresh verifier each time", createCodeVerifier() !== verifier);
}

section("state cookie");
{
  const secret = "s".repeat(32);
  const state = { provider: "google", state: "abc", verifier: "v", redirect: "/dashboard", exp: Math.floor(Date.now() / 1000) + 600 };
  const cookie = signOAuthState(state, secret);
  check("round-trips", JSON.stringify(verifyOAuthState(cookie, secret)) === JSON.stringify(state));
  check("wrong secret is rejected", verifyOAuthState(cookie, "t".repeat(32)) === null);
  const [payload, signature] = cookie.split(".");
  const forged = Buffer.from(JSON.stringify({ ...state, redirect: "https://evil.example" })).toString("base64url");
  check("changed payload is rejected", verifyOAuthState(`${forged}.${signature}`, secret) === null);
  check("extra segment is rejected", verifyOAuthState(`${payload}.${signature}.x`, secret) === null);
  check("expired is rejected", verifyOAuthState(signOAuthState({ ...state, exp: 1 }, secret), secret) === null);
  check("unknown provider is rejected", verifyOAuthState(signOAuthState({ ...state, provider: "myspace" }, secret), secret) === null);
  check("missing cookie", verifyOAuthState(undefined, secret) === null);
}

section("profiles - only verified emails");
{
  const google = normalizeProfile("google", { email: "Ann@Example.com", email_verified: true, name: "Ann", picture: "https://p/a.png" });
  check("OIDC: verified, email lower-cased", google.email === "ann@example.com" && google.emailVerified && google.name === "Ann" && google.avatarUrl === "https://p/a.png");
  check("OIDC: email_verified \"true\" string accepted", normalizeProfile("oidc", { email: "a@b.c", email_verified: "true" }).emailVerified);
  check("OIDC: missing email_verified is NOT verified", !normalizeProfile("oidc", { email: "a@b.c" }).emailVerified);
  check("OIDC: email_verified false", !normalizeProfile("gitlab", { email: "a@b.c", email_verified: false }).emailVerified);
  check("OIDC: preferred_username when no name", normalizeProfile("oidc", { preferred_username: "ann" }).name === "ann");

  const gh = normalizeProfile("github", { login: "ann", name: null, avatar_url: "https://a/x", email: "public@x.io" }, [
    { email: "old@x.io", primary: false, verified: true },
    { email: "Main@X.io", primary: true, verified: true },
  ]);
  check("GitHub: primary verified address, not the public one", gh.email === "main@x.io" && gh.emailVerified, JSON.stringify(gh));
  check("GitHub: login when no name", gh.name === "ann");
  const ghUnverified = normalizeProfile("github", { login: "ann", email: "public@x.io" }, [{ email: "p@x.io", primary: true, verified: false }]);
  check("GitHub: unverified primary -> no email", ghUnverified.email === null && !ghUnverified.emailVerified);
  check("GitHub: no emails list -> no email", normalizeProfile("github", { login: "a", email: "a@x.io" }).email === null);

  const dc = normalizeProfile("discord", { id: "42", username: "ann_", global_name: "Ann", avatar: "abc", email: "ann@x.io", verified: true });
  check("Discord: verified flag, global name, CDN avatar", dc.emailVerified && dc.name === "Ann" && dc.avatarUrl === "https://cdn.discordapp.com/avatars/42/abc.png");
  check("Discord: unverified", !normalizeProfile("discord", { id: "1", email: "a@x.io", verified: false }).emailVerified);
}

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
