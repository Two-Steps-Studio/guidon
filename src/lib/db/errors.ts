/**
 * Database error classification shared by both data-layer modes: node-postgres
 * errors and PostgREST error objects both carry the Postgres SQLSTATE as `.code`.
 */

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

/** 23505 unique_violation - e.g. adding someone who is already a member. */
export function isUniqueViolation(error: unknown): boolean {
  return codeOf(error) === "23505";
}

/** 42501 insufficient_privilege - an RLS WITH CHECK or a missing GRANT rejected the write. */
export function isPermissionDenied(error: unknown): boolean {
  return codeOf(error) === "42501";
}

/**
 * PGRST116 - PostgREST's `.single()` matched zero rows. After an
 * UPDATE/DELETE ... RETURNING on a primary key that usually means RLS
 * filtered the row out, not that it doesn't exist.
 */
export function isNoRowsFromSingle(error: unknown): boolean {
  return codeOf(error) === "PGRST116";
}
