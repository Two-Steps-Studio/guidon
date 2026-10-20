import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api/openapi";
import { SITE_URL } from "@/lib/site-url";

/** OpenAPI 3.1 description of /api/v1 (src/lib/api/openapi.ts). Public: it describes the API, it grants nothing. */
export function GET() {
  return NextResponse.json(buildOpenApiDocument(SITE_URL), {
    headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
