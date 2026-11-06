"use server";

import { AUDIT_UUID, auditAdminMutation } from "@/lib/admin/audit";
import { ADMIN_TAG } from "@/lib/admin/support-policy";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";

type UserRef = { id: string; created_at: string | null };
type TagResult = { id: string; status: "ready" | "saved" | "missing" | "failed" };
const TAG_BATCH_SIZE = 25;
const EXPORT_LIMIT = 500;

function parseIds(raw: string) {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  const ids = [...new Set(raw.trim().toLowerCase().split(/[\s,]+/))];
  return ids.length <= TAG_BATCH_SIZE && ids.every(id => AUDIT_UUID.test(id)) ? ids : null;
}

async function inspectIds(raw: string): Promise<TagResult[] | null> {
  const ids = parseIds(raw);
  if (!ids) return null;
  const { data, error } = await serviceDataClient().from<{ id: string }>("profiles").select("id").in("id", ids);
  if (error) return null;
  const found = new Set(data.map(user => user.id));
  return ids.map(id => ({ id, status: found.has(id) ? "ready" : "missing" }));
}

export async function previewBulkTag(raw: string, tag: string) {
  await requireAdminAccess("users.bulk");
  if (typeof tag !== "string" || !ADMIN_TAG.test(tag)) return null;
  return inspectIds(raw);
}

export async function applyBulkTag(raw: string, tag: string, confirmation: string) {
  return auditAdminMutation<{ error: string | null; rows?: TagResult[] }>("users.bulk", null, async (_admin, changes) => {
    if (confirmation !== "APPLY" || typeof tag !== "string" || !ADMIN_TAG.test(tag)) return { error: "invalid" };
    const preview = await inspectIds(raw);
    if (!preview) return { error: "invalid" };
    const db = serviceDataClient();
    const rows: TagResult[] = [];
    for (const row of preview) {
      if (row.status === "missing") {
        rows.push(row);
        continue;
      }
      const { error } = await db.from("platform_admin_user_tags").insert({ user_id: row.id, tag });
      rows.push({ id: row.id, status: !error || error.code === "23505" ? "saved" : "failed" });
    }
    changes.after = { bulk_operation: "tag", bulk_processed: rows.filter(row => row.status === "saved").length };
    return { error: rows.some(row => row.status === "failed") ? "partial" : null, rows };
  });
}

export async function exportMaskedUsers(tag: string) {
  return auditAdminMutation<{ error: string | null; csv?: string; truncated?: boolean }>("users.bulk", null, async (_admin, changes) => {
    if (typeof tag !== "string" || (tag !== "" && !ADMIN_TAG.test(tag))) return { error: "invalid" };
    const db = serviceDataClient();
    const result = tag
      ? await db.rpcRows<UserRef>("platform_admin_export_tag", { p_tag: tag })
      : await db.from<UserRef>("profiles").select("id, created_at").order("id").limit(EXPORT_LIMIT + 1);
    if (result.error) return { error: "unavailable" };
    const rows = result.data.slice(0, EXPORT_LIMIT);
    // Both columns are server-generated UUIDs or ISO dates, safe for spreadsheet import.
    const lines = rows.map(row => `${row.id},${row.created_at ? new Date(row.created_at).toISOString() : ""}`);
    changes.after = { bulk_operation: "export", bulk_processed: rows.length };
    return { error: null, csv: ["user_id,created_at", ...lines].join("\r\n") + "\r\n", truncated: result.data.length > EXPORT_LIMIT };
  });
}
