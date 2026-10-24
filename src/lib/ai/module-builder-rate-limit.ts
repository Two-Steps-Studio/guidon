import "server-only";
import { createRateLimitWindow } from "./rate-limit-window";

const perUser = createRateLimitWindow(8, 5 * 60 * 1000);
const perOrg = createRateLimitWindow(40, 5 * 60 * 1000);

// Reserve before awaiting provider resolution so concurrent attempts on this
// process consume budget too. Shares the existing limiter's replica limitation.
export function reserveModuleBuilderAttempt(userId: string, projectId: string, organizationId: string): boolean {
  const key = `${userId}:${projectId}`;
  if (perUser.isLimited(key) || perOrg.isLimited(organizationId)) return false;
  perUser.record(key); perOrg.record(organizationId);
  return true;
}
