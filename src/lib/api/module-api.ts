import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { DataClient } from "@/lib/data-client";
import type { InstalledModule } from "@/lib/work/module-records";

/**
 * Shared by the /api/v1 module routes (and through them the MCP module
 * tools): the caller's project role and the public shape of an installed
 * module. Records are not part of it - module data stays in the app.
 */
export async function projectRole(db: DataClient, projectId: string, userId: string): Promise<string | null> {
  const { data } = await db.from<{ role: string }>("project_members").select("role").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  return data?.role ?? null;
}

export const managersOnly = () => NextResponse.json({ error: "Only project owners and admins can install or configure modules." }, { status: 403 });

export function presentModule(entry: InstalledModule) {
  return {
    module_id: entry.moduleId,
    name: entry.manifest.name,
    version: entry.manifest.version,
    installed: entry.installed,
    enabled: entry.enabled,
    permissions: entry.manifest.permissions,
    views: entry.manifest.views.map((view) => ({ id: view.id, name: view.name, type: view.type })),
    automations: (entry.manifest.automations ?? []).map((automation) => ({ id: automation.id, name: automation.name, trigger: automation.trigger, actions: automation.actions.map((action) => action.type) })),
    settings: { default_view: entry.settings.defaultView ?? null, category: entry.settings.category ?? null },
    record_count: entry.records.length,
    revision: entry.revision,
    digest: createHash("sha256").update(JSON.stringify(entry.manifest)).digest("hex"),
  };
}
