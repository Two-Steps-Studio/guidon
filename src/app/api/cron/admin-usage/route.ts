import { timingSafeEqual } from "node:crypto";
import { serviceDataClient } from "@/lib/data-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "Cron unavailable." }, { status: 503, headers });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  }
  const { data, error } = await serviceDataClient().rpc<string>("platform_admin_refresh_usage");
  if (error || !data) return Response.json({ error: "Aggregation failed." }, { status: 503, headers });
  return Response.json({ day: data }, { headers });
}
