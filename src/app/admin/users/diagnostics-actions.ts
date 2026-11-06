"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auditAdminMutation, AUDIT_UUID } from "@/lib/admin/audit";
import { isDiagnosticReason } from "@/lib/admin/diagnostic-reasons";
import { serviceDataClient } from "@/lib/data-client";

export async function startUserDiagnostics(targetId: string, reason: string) {
  const result = await auditAdminMutation<{ error: string | null; id?: string }>(
    "users.diagnostics.start", targetId, async (admin, changes) => {
      if (typeof targetId !== "string" || !AUDIT_UUID.test(targetId) || !isDiagnosticReason(reason)) return { error: "invalid" };
      const { data, error } = await serviceDataClient().from("platform_admin_diagnostics")
        .insert({ actor_id: admin.id, target_id: targetId, reason }).select<{ id: string }>("id").single();
      if (error || !data) return { error: "unavailable" };
      changes.after = { diagnostic_id: data.id, diagnostic_reason: reason };
      return { error: null, id: data.id };
    },
  );
  if (result.error !== null || !("id" in result) || !result.id) return { error: true };
  redirect(`/admin/users/${targetId}/diagnostics/${result.id}`);
}

export async function endUserDiagnostics(targetId: string, sessionId: string) {
  const result = await auditAdminMutation("users.diagnostics.end", targetId, async (admin, changes) => {
    if (typeof targetId !== "string" || !AUDIT_UUID.test(targetId) ||
        typeof sessionId !== "string" || !AUDIT_UUID.test(sessionId)) return { error: "invalid" };
    const { data, error } = await serviceDataClient().from("platform_admin_diagnostics")
      .update({ ended_at: new Date().toISOString() }).eq("actor_id", admin.id)
      .eq("target_id", targetId).eq("id", sessionId).is("ended_at", null).select("id");
    if (error || data.length !== 1) return { error: "unavailable" };
    changes.after = { diagnostic_id: sessionId };
    return { error: null };
  });
  if (result.error !== null) return { error: true };
  revalidatePath(`/admin/users/${targetId}/diagnostics/${sessionId}`);
  redirect(`/admin/users/${targetId}`);
}
