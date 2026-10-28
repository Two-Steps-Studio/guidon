/**
 * What an app (an MCP client, an agent, a script with an API key) changed on a
 * task, kept in activity_logs.details so a person can see it and undo it.
 *
 * Written by PATCH /api/v1/tasks/:id and the status routes; read by the task
 * dialog's "Changes by apps" section. Pure - no server imports - so
 * tests/app-changes.test.mjs runs it directly.
 */

/** Fields an app can change and a person can put back. */
export const TRACKED_TASK_FIELDS = ["title", "description", "status", "priority", "due_date"] as const;
export type TrackedTaskField = (typeof TRACKED_TASK_FIELDS)[number];

export type FieldValue = string | null;
export type FieldChange = { from: FieldValue; to: FieldValue };
export type TaskFieldChanges = Partial<Record<TrackedTaskField, FieldChange>>;

export type AppChangeDetails = {
  via: "api";
  key_name: string | null;
  changes: TaskFieldChanges;
};

export type UndoChangeDetails = { undo_of: string; changes: TaskFieldChanges };

const MAX_STORED_TEXT = 4000;

/** Dates compare by instant, everything else as text; long text is kept whole up to a bound. */
function normalize(field: TrackedTaskField, value: unknown): FieldValue {
  if (value === null || value === undefined || value === "") return null;
  if (field === "due_date") {
    const time = new Date(value as string | Date).getTime();
    return Number.isNaN(time) ? null : new Date(time).toISOString();
  }
  return String(value);
}

/** The tracked fields `patch` actually changes compared with `before`. */
export function diffTaskFields(before: Record<string, unknown>, patch: Record<string, unknown>): TaskFieldChanges {
  const changes: TaskFieldChanges = {};
  for (const field of TRACKED_TASK_FIELDS) {
    if (!(field in patch)) continue;
    const from = normalize(field, before[field]);
    const to = normalize(field, patch[field]);
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}

/**
 * Text longer than the bound can't be put back exactly, so it isn't offered
 * for undo (the change is still listed).
 */
export function isRestorable(change: FieldChange): boolean {
  return (change.from?.length ?? 0) <= MAX_STORED_TEXT && (change.to?.length ?? 0) <= MAX_STORED_TEXT;
}

export function appChangeDetails(keyName: string | null, changes: TaskFieldChanges): AppChangeDetails {
  const stored: TaskFieldChanges = {};
  for (const [field, change] of Object.entries(changes) as [TrackedTaskField, FieldChange][]) {
    stored[field] = isRestorable(change)
      ? change
      : { from: change.from?.slice(0, MAX_STORED_TEXT + 1) ?? null, to: change.to?.slice(0, MAX_STORED_TEXT + 1) ?? null };
  }
  return { via: "api", key_name: keyName?.trim().slice(0, 120) || null, changes: stored };
}

function parseChanges(value: unknown): TaskFieldChanges | null {
  if (!value || typeof value !== "object") return null;
  const changes: TaskFieldChanges = {};
  for (const field of TRACKED_TASK_FIELDS) {
    const change = (value as Record<string, unknown>)[field];
    if (change === undefined) continue;
    if (!change || typeof change !== "object") return null;
    const { from, to } = change as Record<string, unknown>;
    if ((from !== null && typeof from !== "string") || (to !== null && typeof to !== "string")) return null;
    changes[field] = { from, to };
  }
  return Object.keys(changes).length ? changes : null;
}

/** activity_logs.details of an app's change, or null for anything else (including malformed rows). */
export function parseAppChange(details: unknown): AppChangeDetails | null {
  if (!details || typeof details !== "object") return null;
  const raw = details as Record<string, unknown>;
  if (raw.via !== "api") return null;
  const changes = parseChanges(raw.changes);
  if (!changes) return null;
  return { via: "api", key_name: typeof raw.key_name === "string" ? raw.key_name : null, changes };
}

export function parseUndo(details: unknown): UndoChangeDetails | null {
  if (!details || typeof details !== "object") return null;
  const raw = details as Record<string, unknown>;
  if (typeof raw.undo_of !== "string") return null;
  const changes = parseChanges(raw.changes);
  return changes ? { undo_of: raw.undo_of, changes } : null;
}

/**
 * The patch that puts the task back where the app found it - only for fields
 * that still hold the app's value. A field someone changed since is left
 * alone and reported, so an undo never overwrites a person's later edit.
 */
export function undoPatch(
  changes: TaskFieldChanges,
  current: Record<string, unknown>
): { patch: Partial<Record<TrackedTaskField, FieldValue>>; reverted: TaskFieldChanges; changedSince: TrackedTaskField[] } {
  const patch: Partial<Record<TrackedTaskField, FieldValue>> = {};
  const reverted: TaskFieldChanges = {};
  const changedSince: TrackedTaskField[] = [];
  for (const [field, change] of Object.entries(changes) as [TrackedTaskField, FieldChange][]) {
    if (!isRestorable(change)) continue;
    if (normalize(field, current[field]) !== change.to) {
      changedSince.push(field);
      continue;
    }
    patch[field] = change.from;
    reverted[field] = { from: change.to, to: change.from };
  }
  return { patch, reverted, changedSince };
}
