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
// across src/app/api/v1) - and nothing else. This list used to also offer
// tasks:write, projects:read, and context:read, none of which any route has
// ever required (leftover from CRUD routes deleted before this API's
// current shape, per src/app/api/v1/README.md's History section) - a key
// scoped to only those was unusable on every existing endpoint, which the
// scope-picker UI (profile/api-keys.tsx) gave no hint of. Add a scope here
// only once a route actually requires it.
export const API_KEY_SCOPES = ["tasks:read", "tasks:status", "comments:write"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
