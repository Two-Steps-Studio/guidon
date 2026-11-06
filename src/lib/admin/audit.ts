import "server-only";

import { randomUUID } from "node:crypto";
import { serviceDataClient } from "@/lib/data-client";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { tr } from "@/lib/i18n/server-errors";
import type { AdminPermission } from "./permissions";
import type { DiagnosticReason } from "./diagnostic-reasons";

export const AUDIT_TARGETS = {
  "organizations.limits.edit": "organization",
  "organizations.plan.edit": "organization",
  "billing.prices.sync": "billing",
  "promos.create": "promo_code",
  "promos.toggle": "promo_code",
  "modules.review": "module_version",
  "modules.withdraw": "module_version",
  "modules.reports.resolve": "module_report",
  "users.directory.search": "user",
  "users.diagnostics.start": "user",
  "users.diagnostics.end": "user",
} as const satisfies Partial<Record<AdminPermission, string>>;

export type AuditAction = keyof typeof AUDIT_TARGETS;
type AuditState = {
  project_limit?: number;
  plan_id?: "free" | "pro" | "team" | "business" | "enterprise";
  active?: boolean;
  status?: "published" | "rejected" | "withdrawn" | "resolved";
  changed_prices?: number;
  diagnostic_reason?: DiagnosticReason;
  diagnostic_id?: string;
};

export const AUDIT_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function auditAdminMutation<T extends { error: string | null }>(
  action: AuditAction,
  targetId: string | null,
  mutate: (admin: Awaited<ReturnType<typeof requireAdminAccess>>, changes: {
    before?: AuditState;
    after?: AuditState;
  }) => Promise<T>,
): Promise<T | { error: string }> {
  const targetType = AUDIT_TARGETS[action];
  const safeTarget = typeof targetId === "string" && (
    targetType === "module_version"
      ? /^[a-z][a-z0-9-]{0,63}@[0-9A-Za-z.+-]{1,128}$/.test(targetId)
      : AUDIT_UUID.test(targetId)
  ) ? targetId : null;
  const requestId = randomUUID();
  const changes: { before?: AuditState; after?: AuditState } = {};
  async function append(actorId: string, outcome: "succeeded" | "failed" | "denied", requested = false) {
    try {
      const { error } = await serviceDataClient().from("platform_admin_audit_events").insert({
        actor_id: actorId,
        action: requested ? `${action}.requested` : action,
        target_type: targetType,
        target_id: safeTarget,
        request_id: requestId,
        outcome,
        before_state: requested ? null : changes.before ?? null,
        after_state: requested ? null : changes.after ?? null,
      });
      if (!error) return true;
    } catch {
      // Log only the correlation ID. Backend errors can contain input values.
    }
    console.error("Could not append platform admin audit event", requestId, action, outcome);
    return false;
  }

  const admin = await requireAdminAccess(action, async actor => { await append(actor.id, "denied"); });
  if (!await append(admin.id, "succeeded", true)) {
    return { error: await tr("The audit log is unavailable. No changes were made.") };
  }

  let result: T;
  try {
    result = await mutate(admin, changes);
  } catch (error) {
    await append(admin.id, "failed");
    throw error;
  }
  if (!await append(admin.id, result.error === null ? "succeeded" : "failed")) {
    return { error: await tr("The operation finished, but its audit outcome could not be saved. Check the current state before retrying.") };
  }
  return result;
}
