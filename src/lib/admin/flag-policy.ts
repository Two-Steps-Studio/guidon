import { createHash } from "node:crypto";
import { z } from "zod";

export const FLAG_KEY = "invoice-history-import";
export const flagSchema = z.object({
  enabled: z.boolean(),
  killed: z.boolean(),
  rollout: z.number().int().min(0).max(100),
  users: z.array(z.uuid()).max(100),
  organizations: z.array(z.uuid()).max(100),
  plans: z.array(z.enum(["free", "pro", "team", "business", "enterprise"])).max(5),
}).strict();
export type FlagConfig = z.infer<typeof flagSchema>;
export const DEFAULT_FLAG: FlagConfig = { enabled: true, killed: false, rollout: 100, users: [], organizations: [], plans: [] };

export function evaluateFlag(key: string, config: FlagConfig, subject: { user: string; organization: string; plan?: string }) {
  if (config.killed || !config.enabled) return false;
  if (config.users.includes(subject.user) || config.organizations.includes(subject.organization) ||
    config.plans.some(plan => plan === subject.plan)) return true;
  const hash = createHash("sha256").update(`${key}:${subject.organization}`).digest();
  return hash.readUInt32BE(0) / 2 ** 32 < config.rollout / 100;
}
