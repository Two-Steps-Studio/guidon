import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { SITE_URL } from "@/lib/site-url";

/** How long an invitation link works (invitations.expires_at). */
export const INVITATION_TTL_DAYS = 7;

/**
 * A new invitation link token and the hash stored for it (migration 091
 * keeps only the hash - private.invitation_token_hash computes the same
 * SHA-256 hex when the link is opened). 32 random bytes, base64url.
 */
export function newInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token, "utf8").digest("hex") };
}

export function invitationLink(token: string): string {
  return `${SITE_URL}/invite/${encodeURIComponent(token)}`;
}

export function invitationExpiry(now = Date.now()): string {
  return new Date(now + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** A token as it arrives in the URL: base64url only, bounded, so nothing odd reaches the database. */
export function isWellFormedInvitationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,100}$/.test(token);
}
