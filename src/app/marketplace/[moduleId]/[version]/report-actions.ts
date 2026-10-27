"use server";

import { getCurrentUser } from "@/lib/data/current-user";
import { dataClient } from "@/lib/data-client";

const REASONS = ["malicious", "misleading", "privacy", "copyright", "spam", "other"] as const;

/** Abuse report on a version the caller can see (migration 093: one open report per person and version). */
export async function reportModuleVersion(moduleId: string, version: string, reason: string, details: string): Promise<{ result: "reported" | "already_reported" | "not_found" | "invalid" | "failed" }> {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(moduleId) || !/^[0-9A-Za-z.+-]{1,128}$/.test(version) || !(REASONS as readonly string[]).includes(reason) || details.length > 2000) return { result: "invalid" };
  const user = await getCurrentUser();
  const { data, error } = await dataClient(user.id).rpc<string>("report_module_version", { p_module_id: moduleId, p_version: version, p_reason: reason, p_details: details.trim() });
  if (error) return { result: "failed" };
  return { result: data === "reported" || data === "already_reported" ? data : "not_found" };
}
