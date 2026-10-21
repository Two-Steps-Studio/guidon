/**
 * Mobile app sign-in (src/lib/auth/mobile-login-core.ts): PKCE S256 and the
 * redirect back into the app. node:crypto only, so Node's type stripping runs it.
 */
import {
  challengeFromVerifier,
  hashAuthCode,
  isValidCodeChallenge,
  isValidCodeVerifier,
  mobileRedirect,
  newAuthCode,
  verifierMatches,
} from "../../src/lib/auth/mobile-login-core.ts";

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

console.log("\n  mobile sign-in (PKCE)");
// Expected value computed independently:
//   printf %s <verifier> | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '='
const rfcVerifier = "dBjftJeZ4CVP-mJ92K9CmZvhTU9P4fgLEOGBz2mf4Gs";
const rfcChallenge = "ab6jRRZHC3Da0aLGRYTrzGGqreoPS65GonfhPSYl5iQ";
check("S256 = base64url(sha256(verifier)), as openssl computes it", challengeFromVerifier(rfcVerifier) === rfcChallenge, challengeFromVerifier(rfcVerifier));
check("matching verifier accepted", verifierMatches(rfcVerifier, rfcChallenge));
check("other verifier rejected", !verifierMatches(rfcVerifier.replace("d", "e"), rfcChallenge));
check("short verifier rejected", !isValidCodeVerifier("abc"));
check("verifier with bad characters rejected", !isValidCodeVerifier(`${rfcVerifier}!`));
check("challenge must be 43 base64url chars", isValidCodeChallenge(rfcChallenge) && !isValidCodeChallenge(`${rfcChallenge}=`) && !isValidCodeChallenge(""));
const a = newAuthCode();
const b = newAuthCode();
check("codes are random and 256-bit", a !== b && Buffer.from(a, "base64url").length === 32);
check("only a hash is stored, and it's stable", hashAuthCode(a) === hashAuthCode(a) && hashAuthCode(a) !== a && hashAuthCode(a).length === 64);
const redirect = new URL(mobileRedirect("abc_DEF-123", "st 1&x"));
check("redirect goes to guidon://auth only", redirect.protocol === "guidon:" && redirect.host === "auth", redirect.href);
check("redirect carries code and state", redirect.searchParams.get("code") === "abc_DEF-123" && redirect.searchParams.get("state") === "st 1&x");

console.log(`\n  ${pass} pass / ${fail} fail\n`);
process.exit(fail ? 1 : 0);
