import type { ModuleAutomation, ModuleManifest } from "./module-manifest";
import type { ModuleRecord } from "./module-records";

/**
 * Module automations, the pure part: which record events a save produced,
 * which automation runs they start, and how a title template is filled.
 * The queue and the actions live in src/lib/data/module-automations.ts.
 */

export type RecordEvent = { event: ModuleAutomation["trigger"]["event"]; record: ModuleRecord };
export type PlannedRun = { automationId: string; recordId: string; event: RecordEvent["event"]; entity: string; dedupeKey: string; values: ModuleRecord["values"] };

/** At most this many runs per save - a bulk import doesn't flood the queue. */
export const MAX_RUNS_PER_SAVE = 50;

export function diffRecordEvents(before: readonly ModuleRecord[], after: readonly ModuleRecord[]): RecordEvent[] {
  const previous = new Map(before.map((record) => [record.id, record]));
  const next = new Map(after.map((record) => [record.id, record]));
  const events: RecordEvent[] = [];
  for (const record of after) {
    const old = previous.get(record.id);
    if (!old) events.push({ event: "record.created", record });
    else if (JSON.stringify(old.values) !== JSON.stringify(record.values) || old.entity !== record.entity) events.push({ event: "record.updated", record });
  }
  for (const record of before) if (!next.has(record.id)) events.push({ event: "record.deleted", record });
  return events;
}

function matches(automation: ModuleAutomation, event: RecordEvent): boolean {
  if (automation.trigger.event !== event.event || automation.trigger.entity !== event.record.entity) return false;
  const when = automation.trigger.when;
  return !when || (Object.hasOwn(event.record.values, when.field) && event.record.values[when.field] === when.equals);
}

/**
 * The runs a save starts. `revision` is the package revision the save
 * produced, so the same change processed twice is one run (dedupe key) and
 * a later change to the same record is a new one.
 */
export function planAutomationRuns(manifest: ModuleManifest, events: readonly RecordEvent[], revision: number): PlannedRun[] {
  const runs: PlannedRun[] = [];
  for (const automation of manifest.automations ?? []) {
    for (const event of events) {
      if (!matches(automation, event)) continue;
      runs.push({
        automationId: automation.id, recordId: event.record.id, event: event.event, entity: event.record.entity, values: event.record.values,
        dedupeKey: `${manifest.id}:${automation.id}:${event.record.id}:${event.event}:r${revision}`,
      });
      if (runs.length >= MAX_RUNS_PER_SAVE) return runs;
    }
  }
  return runs;
}

/** `{{field}}` -> the record's value as plain text; unknown fields become empty. Result trimmed to 200 characters. */
export function fillTemplate(template: string, values: ModuleRecord["values"]): string {
  const text = template.replace(/\{\{\s*([a-z][a-z0-9-]{0,63})\s*\}\}/g, (_, field: string) => {
    const value = Object.hasOwn(values, field) ? values[field] : null;
    return value === null || value === undefined ? "" : String(value);
  }).replace(/\s+/g, " ").trim();
  return (text || "Module automation").slice(0, 200);
}

/** Wait before retry n (1-based): 1 min, 5 min, 30 min, 2 h; the fifth failure is final. */
export const AUTOMATION_RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000] as const;
export function nextAutomationAttempt(attempts: number, now: Date): Date | null {
  const delay = AUTOMATION_RETRY_DELAYS_MS[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}
