import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processDueDeliveries } from "@/lib/webhooks/deliveries";
import { processDueAutomationRuns } from "@/lib/data/module-automations";

export const dynamic = "force-dynamic";

/**
 * Sends webhook deliveries whose retry time has come (src/lib/webhooks/
 * deliveries.ts) and retries module automation runs (src/lib/data/
 * module-automations.ts, migration 094). Both also run right after the event
 * that queued them; this endpoint covers retries and quiet periods. Call it every few minutes with
 * `Authorization: Bearer $CRON_SECRET` - Vercel Cron sends that header by
 * itself when CRON_SECRET is set; on a self-hosted server use crontab:
 *
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<origin>/api/cron/webhooks
 *
 * Unavailable (503) until CRON_SECRET is configured.
 */
function authorized(request: NextRequest, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const result = await processDueDeliveries(50);
  const automations = await processDueAutomationRuns(50);
  return NextResponse.json({ ...result, automations: automations.attempted }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = run;
export const POST = run;
