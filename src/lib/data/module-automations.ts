import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { serviceDataClient } from "@/lib/data-client";
import { hasDirectDatabase } from "@/lib/db/pool";
import { SITE_URL } from "@/lib/site-url";
import { hostedTaskLimitError } from "@/lib/limits";
import { getWebhookTargetsForProject } from "@/lib/data/organization-webhooks";
import { enqueueAndDeliver } from "@/lib/webhooks/deliveries";
import { notifyOrganizationWebhooks } from "@/lib/webhooks/dispatch";
import { moduleManifestSchema, type ModuleManifest } from "@/lib/work/module-manifest";
import type { ModuleRecord } from "@/lib/work/module-records";
import { diffRecordEvents, fillTemplate, nextAutomationAttempt, planAutomationRuns } from "@/lib/work/module-automation";

/**
 * Module automations (migration 094), the queue. Runs are written and
 * executed with the service role: the person whose save started them was
 * authorized for that save (owner/admin, saveModuleRecords), the run
 * re-checks that they still are before acting, and every action is bounded
 * to the module's own project and to the permissions approved at install.
 */

const TABLE = "module_automation_runs";
const LEASE_MS = 5 * 60_000;
type RunRow = {
  id: string; project_id: string; module_id: string; automation_id: string; record_id: string; event: string;
  record_values: ModuleRecord["values"]; dedupe_key: string; triggered_by: string | null; attempts: number; results: Record<string, string>;
};
const RUN_COLUMNS = "id, project_id, module_id, automation_id, record_id, event, record_values, dedupe_key, triggered_by, attempts, results";
const json = (value: unknown) => (hasDirectDatabase() ? JSON.stringify(value) : value);

/** Called after a successful records save. Queues the runs and starts them once the response is sent. */
export async function enqueueAutomationRuns(input: {
  projectId: string; manifest: ModuleManifest; before: readonly ModuleRecord[]; after: readonly ModuleRecord[]; revision: number; userId: string;
}): Promise<void> {
  if (!input.manifest.automations?.length) return;
  const runs = planAutomationRuns(input.manifest, diffRecordEvents(input.before, input.after), input.revision);
  if (!runs.length) return;
  const db = serviceDataClient();
  const now = new Date();
  const ids: string[] = [];
  for (const run of runs) {
    const { data, error } = await db.from(TABLE).insert({
      project_id: input.projectId, module_id: input.manifest.id, automation_id: run.automationId, record_id: run.recordId, event: run.event,
      record_values: json(run.values), dedupe_key: run.dedupeKey, triggered_by: input.userId,
      // Born leased to this request for its first attempt, like webhook deliveries.
      status: "pending", next_attempt_at: new Date(now.getTime() + LEASE_MS).toISOString(),
    }).select<{ id: string }>("id").maybeSingle();
    if (data) ids.push(data.id);
    else if (error && error.code !== "23505") console.error("[modules] automation run not queued:", error.message);
  }
  if (!ids.length) return;
  after(async () => {
    for (const id of ids) await executeRun(id).catch((error) => console.error("[modules] automation run failed:", error));
  });
}

/** A task id derived from the run and action, so a retry after a half-finished attempt can't create a second task. */
function deterministicId(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

class FinalError extends Error {}

async function runActions(run: RunRow): Promise<Record<string, string>> {
  const db = serviceDataClient();
  const results = { ...run.results };
  const pkg = await db.from<{ manifest: unknown; installed: boolean; enabled: boolean }>("project_module_packages")
    .select("manifest, installed, enabled").eq("project_id", run.project_id).eq("module_id", run.module_id).maybeSingle();
  if (!pkg.data || !pkg.data.installed || !pkg.data.enabled) throw new FinalError("The module is disabled or uninstalled.");
  const parsed = moduleManifestSchema.safeParse(pkg.data.manifest);
  if (!parsed.success) throw new FinalError("The module's manifest is no longer valid.");
  const manifest = parsed.data;
  const automation = manifest.automations?.find((candidate) => candidate.id === run.automation_id);
  if (!automation) throw new FinalError("The automation no longer exists in this module version.");
  if (!run.triggered_by) throw new FinalError("The person who triggered it no longer exists.");
  const member = await db.from<{ role: string }>("project_members").select("role").eq("project_id", run.project_id).eq("user_id", run.triggered_by).maybeSingle();
  if (!member.data || !["owner", "admin"].includes(member.data.role)) throw new FinalError("The person who triggered it no longer manages this project.");
  const project = await db.from<{ organization_id: string; name: string }>("projects").select("organization_id, name").eq("id", run.project_id).maybeSingle();
  if (!project.data) throw new FinalError("The project no longer exists.");

  for (const [index, action] of automation.actions.entries()) {
    const key = String(index);
    if (results[key]) continue;
    if (action.type === "create_task") {
      const limit = await hostedTaskLimitError(run.project_id, project.data.organization_id);
      if (limit) throw new FinalError(limit.slice(0, 300));
      const id = deterministicId(`${run.dedupe_key}:${index}`);
      const title = fillTemplate(action.title, run.record_values);
      const { error } = await db.from("tasks").insert({
        id, project_id: run.project_id, title, status: "todo", priority: action.priority ?? "medium", created_by: run.triggered_by,
        description: `Created by the "${automation.name}" automation of the ${manifest.name} module.`,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
      if (!error) notifyOrganizationWebhooks(run.project_id, run.triggered_by, { kind: "created", taskId: id, title });
      results[key] = `task:${id}`;
    } else if (action.type === "notify") {
      const managers = await db.from<{ user_id: string }>("project_members").select("user_id").eq("project_id", run.project_id).in("role", ["owner", "admin"]);
      if (managers.error) throw new Error(managers.error.message);
      const title = fillTemplate(action.title, run.record_values);
      for (const { user_id } of managers.data) {
        const { error } = await db.from("notifications").insert({
          user_id, project_id: run.project_id, type: "module_automation", title, body: `${manifest.name} · ${automation.name}`.slice(0, 1000),
          link: `/projects/${run.project_id}/extensions/package/${run.module_id}`,
        });
        if (error) throw new Error(error.message);
      }
      results[key] = `notified:${managers.data.length}`;
    } else {
      const found = await getWebhookTargetsForProject(run.project_id);
      const targets = (found?.targets ?? []).filter((target) => target.events.includes("module.automation"));
      for (const target of targets) {
        await enqueueAndDeliver(target, project.data.organization_id, "module.automation", {
          project: { id: run.project_id, name: project.data.name },
          data: {
            module: { id: run.module_id, name: manifest.name, url: `${SITE_URL}/projects/${run.project_id}/extensions/package/${run.module_id}` },
            automation: { id: automation.id, name: automation.name, event: run.event },
            record: { id: run.record_id, values: run.record_values },
            message: automation.name,
          },
        });
      }
      results[key] = `webhooks:${targets.length}`;
    }
    // Record each finished action at once: a retry resumes after it.
    await db.from(TABLE).update({ results: json(results), updated_at: new Date().toISOString() }).eq("id", run.id);
  }
  return results;
}

/** Claims a pending run whose time has come and executes it; false if someone else has it. */
export async function executeRun(id: string, { force = false }: { force?: boolean } = {}): Promise<boolean> {
  const db = serviceDataClient();
  const now = new Date();
  let claim = db.from(TABLE).update({ next_attempt_at: new Date(now.getTime() + LEASE_MS).toISOString(), updated_at: now.toISOString() }).eq("id", id).eq("status", "pending");
  if (!force) claim = claim.lte("next_attempt_at", new Date(now.getTime() + LEASE_MS).toISOString());
  const { data } = await claim.select<RunRow>(RUN_COLUMNS);
  const run = data?.[0];
  if (!run) return false;
  const attempts = run.attempts + 1;
  try {
    const results = await runActions(run);
    await db.from(TABLE).update({ status: "succeeded", attempts, results: json(results), next_attempt_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", id);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    const next = error instanceof FinalError ? null : nextAutomationAttempt(attempts, new Date());
    await db.from(TABLE).update({
      status: next ? "pending" : "failed", attempts, next_attempt_at: next?.toISOString() ?? null, last_error: message, updated_at: new Date().toISOString(),
    }).eq("id", id);
  }
  return true;
}

/** Runs whose retry time has come (cron, see /api/cron/webhooks). */
export async function processDueAutomationRuns(limit = 20): Promise<{ attempted: number }> {
  const { data, error } = await serviceDataClient().from<{ id: string }>(TABLE).select("id").eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  if (error) return { attempted: 0 };
  let attempted = 0;
  for (const { id } of data) if (await executeRun(id)) attempted++;
  return { attempted };
}

/** "Retry" in the module's automation log: the caller manages the project. One more attempt now. */
export async function retryAutomationRun(projectId: string, runId: string): Promise<boolean> {
  const db = serviceDataClient();
  const { data } = await db.from(TABLE).update({ status: "pending", next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", runId).eq("project_id", projectId).eq("status", "failed").lt("attempts", 20).select("id");
  if (!data?.length) return false;
  return executeRun(runId, { force: true });
}
