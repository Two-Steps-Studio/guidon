"use server";

import { redirect } from "next/navigation";
import { AUDIT_UUID, auditAdminMutation } from "@/lib/admin/audit";
import { ADMIN_QUEUES } from "@/lib/admin/operations-queues";
import { serviceDataClient } from "@/lib/data-client";

export async function requeueFailedJob(form: FormData) {
  const id = form.get("id");
  const queue = form.get("queue");
  const result = await auditAdminMutation("operations.manage", typeof id === "string" ? id : null, async (_admin, changes) => {
    if (typeof id !== "string" || !AUDIT_UUID.test(id) || (queue !== "webhooks" && queue !== "automations")) return { error: "invalid" };
    const now = new Date().toISOString();
    const { data, error } = await serviceDataClient().from(ADMIN_QUEUES[queue])
      .update({ status: "pending", next_attempt_at: now, updated_at: now })
      .eq("id", id).eq("status", "failed").lt("attempts", 20).select("id");
    if (error || data.length !== 1) return { error: "unavailable" };
    changes.after = { queue };
    return { error: null };
  });
  redirect(`/admin/operations?result=${result.error === null ? "queued" : "failed"}`);
}
