// Content-Security-Policy (src/lib/csp.ts): pages allow scripts only by
// per-request nonce or the module sandbox hash, never 'unsafe-inline'.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { contentSecurityPolicy, SANDBOX_SCRIPT_HASH } from "../src/lib/csp.ts";
import { SANDBOX_FRAME_HTML } from "../src/lib/work/module-sandbox.ts";

const directive = (policy, name) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

const script = SANDBOX_FRAME_HTML.slice(SANDBOX_FRAME_HTML.indexOf("<script>") + 8, SANDBOX_FRAME_HTML.indexOf("</script>"));
assert.equal(SANDBOX_SCRIPT_HASH, `sha256-${createHash("sha256").update(script).digest("base64")}`, "Update SANDBOX_SCRIPT_HASH when the sandbox frame's script changes");

const page = contentSecurityPolicy({ nonce: "abc123", supabaseUrl: "https://x.supabase.co", posthogHost: "https://eu.i.posthog.com" });
const scripts = directive(page, "script-src");
assert.ok(scripts.includes("'nonce-abc123'") && scripts.includes("'strict-dynamic'") && scripts.includes(`'${SANDBOX_SCRIPT_HASH}'`));
assert.ok(!scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"), "No inline or eval scripts in production");
assert.ok(!/ https?:(\s|$)/.test(scripts) && !scripts.includes("data:"), "No scheme-wide script sources");
assert.ok(scripts.includes("https://eu-assets.i.posthog.com"));
assert.ok(directive(page, "connect-src").includes("https://x.supabase.co"));
assert.ok(directive(page, "connect-src").includes("https://eu-assets.i.posthog.com"), "source maps of PostHog bundles");
assert.equal(directive(page, "object-src"), "object-src 'none'");
assert.equal(directive(page, "frame-ancestors"), "frame-ancestors 'none'");

assert.equal(directive(contentSecurityPolicy({}), "script-src"), "script-src 'self'", "Without a nonce no inline script runs");
assert.ok(directive(contentSecurityPolicy({ nonce: "n", isDev: true }), "script-src").includes("'unsafe-eval'"), "Dev keeps React's eval");
assert.equal(directive(contentSecurityPolicy({ posthogHost: "not a url" }), "connect-src"), "connect-src 'self'");
const withSentry = directive(contentSecurityPolicy({ sentryDsn: "https://publickey@o123.ingest.de.sentry.io/456" }), "connect-src");
assert.equal(withSentry, "connect-src 'self' https://o123.ingest.de.sentry.io", "Sentry's ingest origin, without the key from the DSN");

console.log("pass CSP: nonce + strict-dynamic, sandbox hash current, no unsafe-inline/eval, static fallback");
