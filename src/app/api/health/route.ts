import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { activeStorageProviderName } from "@/lib/storage/provider";

/**
 * Health endpoint (TODO.md §12).
 *
 *   GET /api/health
 *
 * Reports whether each subsystem is reachable, so a self-hosted operator can
 * diagnose an install without Two Steps Studio support (§16).
 *
 * Deliberately exposes NO secrets: no connection strings, no keys, no host
 * names. Each component reports a status and, when unhealthy, a short reason
 * that never contains configuration values.
 */

export const dynamic = "force-dynamic";

type Status = "ok" | "degraded" | "down" | "not_configured";

interface Component {
  status: Status;
  detail?: string;
  [key: string]: unknown;
}

/** Never let a probe hang the health check itself. */
async function withTimeout<T>(
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
function safeReason(error: unknown): string {
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

async function checkDatabase(): Promise<Component> {
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

async function checkStorage(): Promise<Component> {
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

function checkAI(): Component {
  const provider = process.env.AI_PROVIDER?.trim();

  // §6/§7 — the abstraction does not exist yet. Reporting "not configured"
  // is honest; claiming "ok" because a variable is set would not be.
  if (!provider) {
    return { status: "not_configured", detail: "no AI provider configured" };
  }

  return {
    status: "not_configured",
    provider,
    detail: "AI provider abstraction is not implemented yet",
  };
}

function checkAuth(): Component {
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

export async function GET() {
  const started = Date.now();

  const [database, storage] = await Promise.all([
    checkDatabase(),
    checkStorage(),
  ]);

  const components = {
    web: { status: "ok" as Status },
    database,
    storage,
    auth: checkAuth(),
    ai: checkAI(),
  };

  // `not_configured` is a valid state for optional subsystems, so only a
  // genuine failure makes the whole instance unhealthy.
  const failed = Object.values(components).filter(
    (component) => component.status === "down"
  );
  const degraded = Object.values(components).filter(
    (component) => component.status === "degraded"
  );

  const status: Status = failed.length
    ? "down"
    : degraded.length
      ? "degraded"
      : "ok";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - started,
      components,
    },
    {
      // Container probes must never read a cached answer.
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
