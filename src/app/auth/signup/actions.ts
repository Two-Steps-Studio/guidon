"use server";

import { signUpLocal, createLocalSession } from "@/lib/auth/local-auth";

export type SignupActionResult = { error: string } | { ok: true };

/**
 * Self-hosted signup. No email confirmation step — there is no mail sender
 * configured in this project (see docs/self-hosting.md); the account is
 * usable immediately, same as the trigger's `email_confirmed_at` default in
 * signUpLocal(). Creates and sets the session directly so signup logs the
 * user in, matching what the cloud path does when Supabase email
 * confirmation is disabled.
 */
export async function signupLocalAction(
  email: string,
  password: string,
  fullName: string
): Promise<SignupActionResult> {
  const result = await signUpLocal(email, password, fullName);
  if ("error" in result) return { error: result.error };

  await createLocalSession(result.userId);
  return { ok: true };
}
