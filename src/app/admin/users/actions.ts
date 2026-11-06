"use server";

import { randomUUID } from "node:crypto";
import { AUDIT_UUID } from "@/lib/admin/audit";
import { serviceDataClient } from "@/lib/data-client";
import { requireAdminAccess } from "@/lib/data/admin-access";

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
