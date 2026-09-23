/**
 * API key scope vocabulary - pure data, no server-only dependency, so it
 * can be imported from both server code (route-guard.ts, api-keys.ts) and
 * the client-side key-creation form (profile/api-keys.tsx). Split out of
 * api-keys.ts specifically because that file imports "server-only" for its
 * node:crypto-based generation/hashing functions, and a client component
 * can't import anything from a module carrying that marker - even a plain
 * constant it never touches at runtime, since the whole module is one
 * bundle boundary as far as Next.js's server-only check is concerned.
 */

// Every scope actually checked by a route (grep guardApiRequest(request, "
// across src/app/api/v1) - and nothing else. Add a scope here only once a
// route actually requires it - tasks:write was previously removed for
// exactly that reason (unused, leftover from CRUD routes deleted before
// this API's current shape) and only comes back now that
// POST/PATCH/DELETE task routes exist to require it. attempts:write is
// required by POST /api/v1/tasks/[taskId]/attempts (recording a Previous
// Attempt); reading attempts is covered by tasks:read. reports:write is
// required by POST /api/v1/projects/[projectId]/reports (in-game bug
// reports) and deliberately opens nothing else: its key ships inside game
// builds, so it must be safe to leak - give it no other scope.
export const API_KEY_SCOPES = [
  "tasks:read",
  "tasks:write",
  "tasks:status",
  "comments:write",
  "attempts:write",
  "reports:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/**
 * reports:write must stand alone - see the note above API_KEY_SCOPES. A key
 * that also carried tasks:* would hand everyone who unpacks the game build
 * read/write access to every project its creator can reach.
 */
export function reportsScopeMixedWithOthers(scopes: readonly string[]): boolean {
  return scopes.includes("reports:write") && scopes.length > 1;
}
