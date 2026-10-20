// No imports: used by server code, client components and signup validation.

/**
 * AI accounts (migration 059) get an address in this reserved domain
 * (RFC 2606 .invalid - no mail can reach it, so no sign-in link either).
 * The server is the only one that hands these out - signup rejects the
 * domain - so lists can tell an AI account apart by its address alone.
 */
export const AI_ACCOUNT_EMAIL_DOMAIN = "agents.guidon.invalid";

export function isAiAccountEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${AI_ACCOUNT_EMAIL_DOMAIN}`);
}
