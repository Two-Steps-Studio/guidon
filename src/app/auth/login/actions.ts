"use server";

import { signInLocal, createLocalSession } from "@/lib/auth/local-auth";

export type LoginActionResult = { error: string } | { ok: true };

/**
 * Self-hosted login (DATABASE_URL set, no Supabase software running).
 * Mirrors the cloud path's shape (client calls it, then navigates itself on
 * success) rather than calling redirect() here, so the caller's existing
 * try/catch + router.push flow needs no special-casing for the framework's
 * own redirect signal.
 */
export async function loginLocalAction(email: string, password: string): Promise<LoginActionResult> {
  const result = await signInLocal(email, password);
  if ("error" in result) return { error: result.error };

  await createLocalSession(result.userId);
  return { ok: true };
}
