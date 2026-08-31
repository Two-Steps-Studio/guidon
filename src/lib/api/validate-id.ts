import "server-only";

import { NextResponse } from "next/server";

/**
 * Every /api/v1 route param that names a row (taskId, projectId) ends up as
 * a bind parameter in a `uuid`-typed WHERE clause, on both DB paths - a
 * malformed value doesn't fail to match, it makes Postgres itself throw
 * ("invalid input syntax for type uuid"), which no route here catches, so
 * it surfaced as an unhandled Next.js 500 instead of a clean 400. Mirrors
 * the UUID check withUser() already does for `userId` (src/lib/db/session.ts).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** `{ error }` JSON, 400 - return this immediately when isValidUuid() fails. */
export function invalidIdResponse(paramName: string): NextResponse {
  return NextResponse.json({ error: `"${paramName}" must be a valid id.` }, { status: 400 });
}
