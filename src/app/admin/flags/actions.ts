"use server";

import { redirect } from "next/navigation";
import { auditAdminMutation } from "@/lib/admin/audit";
import { FLAG_KEY, flagSchema } from "@/lib/admin/flag-policy";
import { serviceDataClient } from "@/lib/data-client";

export async function saveImportFlag(form: FormData) {
  const result = await auditAdminMutation("flags.manage", FLAG_KEY, async (_admin, changes) => {
    const raw = form.get("config");
    if (typeof raw !== "string" || raw.length > 10000) return { error: "invalid" };
    let config;
    try {
      config = flagSchema.safeParse(JSON.parse(raw));
    } catch {
      return { error: "invalid" };
    }
    if (!config.success) return { error: "invalid" };
    const { error } = await serviceDataClient().upsertRow("platform_feature_flags", {
      key: { flag_key: FLAG_KEY }, set: { config: config.data },
    });
    if (error) return { error: "unavailable" };
    changes.after = { flag_enabled: config.data.enabled, flag_killed: config.data.killed, flag_rollout: config.data.rollout };
    return { error: null };
  });
  redirect(`/admin/flags?result=${result.error === null ? "saved" : "failed"}`);
}
