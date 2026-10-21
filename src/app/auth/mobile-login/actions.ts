"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/current-user";
import { createMobileAuthCode } from "@/lib/auth/mobile-login";
import { isValidCodeChallenge, mobileRedirect } from "@/lib/auth/mobile-login-core";

/**
 * "Allow" on /auth/mobile-login: a one-time code for the signed-in browser
 * session, handed back to the app on guidon://auth. Worthless without the
 * PKCE verifier the app kept - see lib/auth/mobile-login.ts.
 */
export async function authorizeMobileLogin(codeChallenge: string, state: string): Promise<void> {
  if (!isValidCodeChallenge(codeChallenge) || !state || state.length > 200) {
    throw new Error("Invalid mobile sign-in request.");
  }
  const user = await getCurrentUser();
  const code = await createMobileAuthCode(user.id, codeChallenge);
  redirect(mobileRedirect(code, state));
}
