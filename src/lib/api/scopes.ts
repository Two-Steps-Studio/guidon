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

export const API_KEY_SCOPES = [
  "tasks:read",
  "tasks:write",
  "tasks:status",
  "projects:read",
  "context:read",
  "comments:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
