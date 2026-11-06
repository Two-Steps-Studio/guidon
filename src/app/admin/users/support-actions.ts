"use server";

import { redirect } from "next/navigation";
import { auditAdminMutation, AUDIT_UUID } from "@/lib/admin/audit";
import { ADMIN_TAG } from "@/lib/admin/support-policy";
import { serviceDataClient } from "@/lib/data-client";

export async function updateSupportRecord(userId: string, form: FormData) {
  if (typeof userId !== "string" || !AUDIT_UUID.test(userId)) redirect("/admin/users");
  const result = await auditAdminMutation("users.support.manage", userId, async (admin, changes) => {
    const operation = form.get("operation");
    const input = form.get("value");
    if (typeof input !== "string") return { error: "invalid" };
    const value = input.trim();
    const db = serviceDataClient();
    if (operation === "note" && value && value.length <= 2000) {
      const { error } = await db.from("platform_admin_notes").insert({ user_id: userId, author_id: admin.id, body: value });
      if (error) return { error: "unavailable" };
    } else if ((operation === "pin" || operation === "unpin") && AUDIT_UUID.test(value)) {
      const { data, error } = await db.from("platform_admin_notes").update({ pinned: operation === "pin" })
        .eq("id", value).eq("user_id", userId).select("id");
      if (error || data.length !== 1) return { error: "unavailable" };
    } else if ((operation === "tag" || operation === "untag") && ADMIN_TAG.test(value)) {
      const query = operation === "tag"
        ? db.from("platform_admin_user_tags").insert({ user_id: userId, tag: value })
        : db.from("platform_admin_user_tags").delete().eq("user_id", userId).eq("tag", value);
      const { error } = await query;
      if (error && !(operation === "tag" && error.code === "23505")) return { error: "unavailable" };
    } else return { error: "invalid" };
    changes.after = { support_operation: operation };
    return { error: null };
  });
  redirect(`/admin/users/${userId}?support=${result.error === null ? "saved" : "failed"}`);
}
