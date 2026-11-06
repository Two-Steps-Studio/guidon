"use server";

import { randomUUID } from "node:crypto";
import { AUDIT_UUID, auditAdminMutation } from "@/lib/admin/audit";
import { serviceDataClient } from "@/lib/data-client";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { listUsersForAdmin, type AdminUserRow } from "@/lib/data/admin";
import { hasDirectDatabase } from "@/lib/db/pool";
import { createServiceClient } from "@/lib/supabase-server";
import { deliverPasswordRecovery } from "@/lib/auth/password-recovery";
import { isEmailConfigured } from "@/lib/email/resend";
import { isAiAccountEmail } from "@/lib/ai-account-email";

export async function applyAdminAccountOperation(operation: string, userId: string, confirmation: string) {
  const action = operation === "block" ? "users.signin.block"
    : operation === "unblock" ? "users.signin.unblock" : "users.password.recovery";
  return auditAdminMutation(action, userId, async (admin, changes) => {
    if (operation !== "recovery" && operation !== "block" && operation !== "unblock") return { error: "invalid" };
    if (typeof userId !== "string" || !AUDIT_UUID.test(userId) || confirmation !== userId) {
      return { error: "confirmation" };
    }
    if (hasDirectDatabase() || (operation === "recovery" && !isEmailConfigured())) return { error: "unavailable" };
    const targetId = userId.toLowerCase();
    if (operation !== "recovery" && targetId === admin.id) return { error: "self" };
    try {
      const auth = createServiceClient().auth.admin;
      const { data, error } = await auth.getUserById(targetId);
      if (error || !data.user || isAiAccountEmail(data.user.email)) return { error: "unavailable" };
      if (operation === "recovery") {
        if (!data.user.email) return { error: "unavailable" };
        const result = await deliverPasswordRecovery(data.user.email, targetId);
        return { error: result === "sent" ? null : result };
      }
      const block = operation === "block";
      const updated = await auth.updateUserById(targetId, { ban_duration: block ? "876000h" : "none" });
      if (updated.error || updated.data.user?.id !== targetId) return { error: "unavailable" };
      changes.after = { signin_blocked: block };
      return { error: null };
    } catch {
      return { error: "unavailable" };
    }
  });
}

const searchPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  name: /^[\p{L}\p{M}][\p{L}\p{M} .’'-]{1,99}$/u,
  domain: /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i,
  stripe: /^(?:cus|sub)_[a-z\d]+$/i,
};

export async function searchAdminUsers(kind: string, value: string, cursor: string | null) {
  const after = typeof cursor === "string" && AUDIT_UUID.test(cursor) ? cursor : null;
  const term = typeof value === "string" ? value.trim() : "";
  if (kind === "all" || kind === "id") {
    await requireAdminAccess("users.read");
    if (kind === "id" && !AUDIT_UUID.test(term)) return { error: "invalid" };
    const { data, error } = await listUsersForAdmin(after, kind === "id" ? term : undefined);
    return error ? { error: "unavailable" } : { error: null, rows: data };
  }

  return auditAdminMutation<{ error: string | null; rows?: AdminUserRow[] }>("users.directory.search", null, async () => {
    const pattern = Object.hasOwn(searchPatterns, kind) ? searchPatterns[kind as keyof typeof searchPatterns] : undefined;
    if (!pattern || term.length > 254 || !pattern.test(term)) return { error: "invalid" };
    const { data, error } = await serviceDataClient().rpcRows<AdminUserRow>("platform_admin_search_profiles", {
      p_kind: kind, p_term: term, p_after: after,
    });
    return error ? { error: "unavailable" } : { error: null, rows: data };
  });
}

export async function revealAdminProfile(userId: string) {
  const requestId = randomUUID();
  const target = typeof userId === "string" && AUDIT_UUID.test(userId) ? userId.toLowerCase() : null;
  const admin = await requireAdminAccess("users.pii.reveal", async actor => {
    try {
      const { error } = await serviceDataClient().from("platform_admin_audit_events").insert({
        actor_id: actor.id, target_id: target, target_type: "user", action: "users.pii.reveal",
        outcome: "denied", request_id: requestId,
      });
      if (error) console.error("Could not audit denied profile disclosure", requestId);
    } catch {
      console.error("Could not audit denied profile disclosure", requestId);
    }
  });
  if (!target) return { status: "failed" as const };
  const { data, error } = await serviceDataClient().rpc<{
    status: "limited" | "failed" | "succeeded";
    profile?: { email: string | null; name: string | null } | null;
  }>("platform_admin_reveal_profile", { p_actor: admin.id, p_target: target, p_request: requestId });
  if (error || !data) {
    console.error("Could not complete audited profile disclosure", requestId);
    return { status: "unavailable" as const };
  }
  return data;
}
