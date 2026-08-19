import "server-only";

import { createServiceClient } from "@/lib/supabase-server";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withServiceRole } from "@/lib/db/session";
import { activeStorageProviderName } from "@/lib/storage/provider";
import { activeAIProviderName } from "@/lib/ai/provider";

/**
 * Health check logic (TODO.md §12), extracted from `/api/health` so the
 * admin panel's System Status section (TODO.md §25) can render the same
 * checks for a human instead of duplicating them with slightly different
 * logic that would silently drift from the container probe's answer.
 *
 * `/api/health/route.ts` is the only other importer — it re-exports nothing
 * of its own, it just calls these and shapes the HTTP response.
 *
 * Deliberately exposes NO secrets: no connection strings, no keys, no host
 * names. Each component reports a status and, when unhealthy, a short reason
 * that never contains configuration values.
 */

export type Status = "ok" | "degraded" | "down" | "not_configured";

export interface Component {
  status: Status;
  detail?: string;
  [key: string]: unknown;
}

/** checkDatabase()'s return shape, typed for callers that want `latency_ms` without an `unknown` cast. */
export interface DatabaseCheck extends Component {
  latency_ms?: number;
}

/** checkStorage()'s return shape — `provider` is set whenever the STORAGE_PROVIDER env var parsed. */
export interface StorageCheck extends Component {
  provider?: string;
}

/** checkAI()'s return shape — `model` is only present when a provider actually constructed. */
export interface AICheck extends Component {
  provider?: string;
  model?: string;
}

/** checkAuth()'s return shape — provider names only, never credentials. */
export interface AuthCheck extends Component {
  providers?: string[];
}

/** Never let a probe hang the health check itself. */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Scrub anything that could carry configuration into the response — driver
 * errors happily include hosts, ports and occasionally credentials.
 */
export function safeReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/timed out/i.test(raw)) return "timed out";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) {
    return "unreachable";
  }
  if (/JWT|api key|invalid.*key|unauthor/i.test(raw)) {
    return "credentials rejected";
  }
  if (/permission denied|not allowed/i.test(raw)) return "permission denied";

  return "unavailable";
}

export async function checkDatabase(): Promise<DatabaseCheck> {
  if (hasDirectDatabase()) {
    try {
      const started = Date.now();
      // withServiceRole(), not withUser() — there is no request-scoped
      // identity for an unauthenticated container probe to assert, and
      // BYPASSRLS is fine here: this proves the connection and role
      // switching work, not that any particular row is readable.
      await withTimeout(
        withServiceRole(({ query }) => query("SELECT 1")),
        5000,
        "database"
      );
      return { status: "ok", latency_ms: Date.now() - started };
    } catch (error) {
      return { status: "down", detail: safeReason(error) };
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { status: "not_configured", detail: "no database configured" };
  }

  try {
    const supabase = createServiceClient();

    // Cheapest query that proves connectivity, auth and RLS plumbing without
    // reading anyone's data: a count over an empty selection.
    const started = Date.now();
    // Supabase's builder is a PromiseLike, not a Promise — Promise.resolve
    // adapts it so it can race against the timeout.
    const { error } = await withTimeout(
      Promise.resolve(
        supabase.from("profiles").select("id", { count: "exact", head: true })
      ),
      5000,
      "database"
    );

    if (error) throw error;

    // The row count is deliberately not reported: this endpoint is
    // unauthenticated so a container probe can reach it, and how many
    // people use an instance is nobody else's business.
    return { status: "ok", latency_ms: Date.now() - started };
  } catch (error) {
    return { status: "down", detail: safeReason(error) };
  }
}

export async function checkStorage(): Promise<StorageCheck> {
  let provider: string;

  try {
    provider = activeStorageProviderName();
  } catch (error) {
    return { status: "down", detail: safeReason(error) };
  }

  try {
    const { getStorageProvider } = await import("@/lib/storage/provider");
    const instance = await withTimeout(getStorageProvider(), 5000, "storage");

    return { status: "ok", provider: instance.name };
  } catch (error) {
    // s3 throws by design until implemented — report it as configuration,
    // not as an outage.
    const raw = error instanceof Error ? error.message : "";
    if (/not implemented/i.test(raw)) {
      return { status: "not_configured", provider, detail: "not implemented" };
    }

    return { status: "down", provider, detail: safeReason(error) };
  }
}

export async function checkAI(): Promise<AICheck> {
  let provider: string | null;

  try {
    provider = activeAIProviderName();
  } catch (error) {
    return { status: "down", detail: safeReason(error) };
  }

  // §6/§7 — AI is an optional subsystem: an unset AI_PROVIDER is a
  // legitimate "not configured" state, not a failure (same treatment as
  // checkStorage's "not implemented" branch and checkAuth's
  // no-Supabase-configured branch).
  if (!provider) {
    return { status: "not_configured", detail: "no AI provider configured" };
  }

  try {
    const { getAIProvider } = await import("@/lib/ai/provider");
    // Construct only — never call .complete() here. This is an
    // unauthenticated container health probe; it must not make a real,
    // possibly-billed request to an external AI vendor on every check.
    // Construction alone still proves the config is present and
    // well-shaped: a missing API key or model throws right here, matching
    // how checkStorage only constructs the storage provider rather than
    // performing a real upload.
    const instance = await withTimeout(getAIProvider(), 5000, "ai");
    return { status: "ok", provider: instance.name, model: instance.model };
  } catch (error) {
    return { status: "down", provider, detail: safeReason(error) };
  }
}

export function checkAuth(): AuthCheck {
  // Self-hosted email/password auth (src/lib/auth/local-auth.ts) needs no
  // Supabase project at all — reporting "down" here whenever
  // NEXT_PUBLIC_SUPABASE_URL is unset would call a fully working self-hosted
  // login broken. OAuth is never available in this mode (no GoTrue to
  // redirect to — the sign-in page hides those buttons itself), so
  // NEXT_PUBLIC_AUTH_PROVIDERS is irrelevant here too.
  if (hasDirectDatabase()) {
    return { status: "ok", providers: ["password"] };
  }

  const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (!hasSupabase) {
    return { status: "down", detail: "auth backend not configured" };
  }

  return {
    status: "ok",
    // Names only — never keys.
    providers: providers.length > 0 ? providers : ["password"],
  };
}
