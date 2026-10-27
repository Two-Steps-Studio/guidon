"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess } from "@/lib/data/admin-access";
import { serviceDataClient } from "@/lib/data-client";
import { createNotification } from "@/lib/data/notifications";
import { signPublishedVersion } from "@/lib/data/module-registry";
import { tr } from "@/lib/i18n/server-errors";

const isId = (value: string) => /^[a-z][a-z0-9-]{0,63}$/.test(value);
const isVersion = (value: string) => /^[0-9A-Za-z.+-]{1,128}$/.test(value);

/**
 * Instance admins (ADMIN_EMAILS) review public submissions. The database
 * function refuses a reviewer who submitted the version, whatever the app
 * checks - the CHECK on module_catalog_entries backs it up.
 */
export async function reviewModuleVersion(moduleId: string, version: string, decision: "approve" | "reject", note: string): Promise<{ error: string | null }> {
  const admin = await requireAdminAccess();
  if (!isId(moduleId) || !isVersion(version) || !["approve", "reject"].includes(decision) || note.length > 2000) return { error: await tr("Invalid request.") };
  if (decision === "reject" && !note.trim()) return { error: await tr("Explain why the version is rejected - the author sees this note.") };
  const db = serviceDataClient();
  const { data: entry } = await db.from("module_catalog_entries").select<{ submitted_by: string | null; manifest: { name?: string } }>("submitted_by, manifest").eq("module_id", moduleId).eq("version", version).maybeSingle();
  if (entry?.submitted_by === admin.id) return { error: await tr("You cannot review a module you submitted. Ask another admin.") };
  const { data: result, error } = await db.rpc<string>("review_module_version", { p_module_id: moduleId, p_version: version, p_reviewer: admin.id, p_decision: decision, p_note: note });
  if (error) return { error: error.message };
  if (result === "self_review") return { error: await tr("You cannot review a module you submitted. Ask another admin.") };
  if (result !== "published" && result !== "rejected") return { error: await tr("This version is no longer waiting for review.") };
  if (result === "published") await signPublishedVersion(moduleId, version, admin.id);
  if (entry?.submitted_by) {
    const name = typeof entry.manifest?.name === "string" ? entry.manifest.name : moduleId;
    await createNotification({
      userId: entry.submitted_by, type: "module_review", link: "/my-modules#published",
      title: `${name} ${version}: ${result === "published" ? "published" : "not approved"}`.slice(0, 200),
      body: note.trim() ? note.trim().slice(0, 1000) : null,
    });
  }
  revalidatePath("/admin/modules"); revalidatePath("/marketplace");
  return { error: null };
}

/** Takes a version out of the catalog and installation (existing installations keep working). */
export async function withdrawModuleVersionAsAdmin(moduleId: string, version: string, note: string): Promise<{ error: string | null }> {
  const admin = await requireAdminAccess();
  if (!isId(moduleId) || !isVersion(version) || note.length > 2000) return { error: await tr("Invalid request.") };
  const db = serviceDataClient();
  const result = await db.from("module_catalog_entries").update({ status: "withdrawn", published: false }).eq("module_id", moduleId).eq("version", version).neq("status", "withdrawn").select("module_id");
  if (result.error) return { error: result.error.message };
  if (!result.data.length) return { error: await tr("This version is already withdrawn.") };
  await db.from("module_registry_events").insert({ module_id: moduleId, version, actor_id: admin.id, action: "withdrawn", note: note.trim() || null });
  revalidatePath("/admin/modules"); revalidatePath("/marketplace");
  return { error: null };
}

export async function resolveModuleReport(reportId: string): Promise<{ error: string | null }> {
  const admin = await requireAdminAccess();
  if (!/^[0-9a-f-]{36}$/.test(reportId)) return { error: await tr("Invalid request.") };
  const db = serviceDataClient();
  const result = await db.from("module_reports").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", reportId).eq("status", "open").select<{ module_id: string; version: string }>("module_id, version");
  if (result.error) return { error: result.error.message };
  const report = result.data[0];
  if (!report) return { error: await tr("This report is already resolved.") };
  await db.from("module_registry_events").insert({ module_id: report.module_id, version: report.version, actor_id: admin.id, action: "report_resolved" });
  revalidatePath("/admin/modules");
  return { error: null };
}
