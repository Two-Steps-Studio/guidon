import { NextResponse } from "next/server";
import { checkDatabase, checkStorage, checkAI, checkAuth, type Status } from "@/lib/health/checks";

/**
 * Health endpoint (TODO.md §12).
 *
 *   GET /api/health
 *
 * Reports whether each subsystem is reachable, so a self-hosted operator can
 * diagnose an install without Two Steps Studio support (§16).
 *
 * The actual checks live in src/lib/health/checks.ts, shared with the admin
 * panel's System Status section (TODO.md §25) — this file only shapes the
 * HTTP response.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();

  const [database, storage, ai] = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkAI(),
  ]);

  const components = {
    web: { status: "ok" as Status },
    database,
    storage,
    auth: checkAuth(),
    ai,
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
