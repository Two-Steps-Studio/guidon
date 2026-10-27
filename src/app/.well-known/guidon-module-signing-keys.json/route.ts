import { moduleSigningKey } from "@/lib/work/module-signing";
import { discoveryPreflight } from "@/lib/discovery-response";

export const dynamic = "force-dynamic";
/** Public half of MODULE_SIGNING_KEY: verifies module registry signatures (src/lib/work/module-signing.ts). */
export function GET() {
  const key = moduleSigningKey();
  return Response.json(key ? { keys: [key.publicJwk] } : { error: "Module signing is not configured." }, {
    status: key ? 200 : 404,
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": key ? "public, max-age=300" : "no-store" },
  });
}
export const OPTIONS = discoveryPreflight;
