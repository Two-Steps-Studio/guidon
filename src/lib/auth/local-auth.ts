import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { withServiceRole } from "@/lib/db/session";
import { SESSION_COOKIE_NAME, signSession, verifySessionCookie } from "@/lib/auth/session-cookie";
import { isLockedOut, recordFailedAttempt, clearAttempts } from "@/lib/auth/rate-limit";

/**
 * Self-hosted email/password authentication (TODO.md §8, §30).
 *
 * Replaces Supabase Auth (GoTrue) for installs with no Supabase software
 * running — DATABASE_URL set, talking to a plain PostgreSQL. Writes go
 * straight to auth.users (recreated by src/db/bootstrap/000_auth_compat.sql),
 * the same table Supabase's own GoTrue would own on a cloud install, so the
 * existing `AFTER INSERT ON auth.users` trigger (private.handle_new_user(),
 * migration 001) creates the profile row exactly as it does today — nothing
 * about the schema changes for this to work.
 *
 * Password hashing uses Node's built-in `scrypt`, not a dependency: the
 * codebase already avoids adding packages where the standard library covers
 * it (see the HMAC signing in src/lib/storage/providers/local.ts), and scrypt
 * needs no native bindings.
 *
 * auth.users has RLS enabled with zero policies (intentional — see
 * 000_auth_compat.sql §3), so every query here goes through
 * withServiceRole(), the same bypass the admin panel and migrations use. That
 * is correct, not a shortcut: nothing about "is this email taken" or
 * "does this password match" can be scoped to a not-yet-authenticated caller.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const actual = await scrypt(password, salt, expected.length || SCRYPT_KEYLEN);
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}

export type LocalAuthResult = { userId: string } | { error: string };

/** Generic on purpose — never reveals whether an email is registered. */
const INVALID_CREDENTIALS = "Invalid email or password.";

export async function signUpLocal(
  email: string,
  password: string,
  fullName?: string
): Promise<LocalAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_RE.test(normalizedEmail)) return { error: "Enter a valid email address." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  return withServiceRole(async ({ query }) => {
    const existing = await query("SELECT id FROM auth.users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length > 0) {
      // Same generic message as a failed login — confirming an email exists
      // via signup is the same enumeration leak as confirming it via login.
      return { error: INVALID_CREDENTIALS };
    }

    const encryptedPassword = await hashPassword(password);
    const metadata = fullName ? { full_name: fullName } : {};

    const result = await query(
      `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
       VALUES ($1, $2, now(), $3::jsonb)
       RETURNING id`,
      [normalizedEmail, encryptedPassword, JSON.stringify(metadata)]
    );

    return { userId: result.rows[0].id as string };
  });
}

const LOCKED_OUT = "Too many failed attempts. Try again in a few minutes.";

export async function signInLocal(email: string, password: string): Promise<LocalAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (isLockedOut(normalizedEmail)) {
    return { error: LOCKED_OUT };
  }

  return withServiceRole(async ({ query }) => {
    const result = await query(
      "SELECT id, encrypted_password FROM auth.users WHERE email = $1",
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      recordFailedAttempt(normalizedEmail);
      return { error: INVALID_CREDENTIALS };
    }

    const row = result.rows[0] as { id: string; encrypted_password: string | null };
    if (!row.encrypted_password) {
      recordFailedAttempt(normalizedEmail);
      return { error: INVALID_CREDENTIALS };
    }

    const valid = await verifyPassword(password, row.encrypted_password);
    if (!valid) {
      recordFailedAttempt(normalizedEmail);
      return { error: INVALID_CREDENTIALS };
    }

    clearAttempts(normalizedEmail);
    return { userId: row.id };
  });
}

const isProduction = () => process.env.NODE_ENV === "production";

export async function createLocalSession(userId: string): Promise<void> {
  const { value, expiresAt } = await signSession(userId);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getLocalSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function clearLocalSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
