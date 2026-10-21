import { NextRequest } from "next/server";
import { revokeToken } from "@/lib/oauth/oauth";
import { CORS_HEADERS, preflight, readParams } from "@/lib/oauth/http";

/** RFC 7009 token revocation: always 200, whether or not the token existed. */
export async function POST(request: NextRequest) {
  const params = await readParams(request);
  if (params?.token) await revokeToken(params.token);
  return new Response(null, { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
}

export const OPTIONS = preflight;
