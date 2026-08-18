import "server-only";

import { hasDirectDatabase } from "@/lib/db/pool";

/**
 * Guidon Cloud (hosted — no self-managed Postgres) caps an organization at
 * one project. Self-hosted installs (DATABASE_URL set) have no such limit —
 * it's your own infrastructure, not a shared resource Guidon is paying for.
 *
 * There is no broader pricing/tier model defined anywhere in this codebase
 * yet (TODO.md has none) — this is the one hosted-vs-self-hosted product
 * distinction that exists today. Kept in one place so the UI's "hide the
 * button" check and the Server Action's actual enforcement can never drift
 * apart from each other.
 */
export const HOSTED_PROJECT_LIMIT_PER_ORG = 1;

export function isHostedProjectLimitReached(currentProjectCount: number): boolean {
  if (hasDirectDatabase()) return false;
  return currentProjectCount >= HOSTED_PROJECT_LIMIT_PER_ORG;
}

export const HOSTED_PROJECT_LIMIT_MESSAGE =
  "Guidon Cloud is limited to 1 project per organization. Create another organization, or self-host Guidon for unlimited projects.";
