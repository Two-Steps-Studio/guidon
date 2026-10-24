import { z } from "zod";
import { parseModulePlan, compileModulePlan, type ModulePlan } from "./module-builder";
import { moduleManifestSchema, type ModuleManifest } from "./module-manifest";

export type DraftSnapshot = { prompt: string; plan: ModulePlan | null; manifest: ModuleManifest | null };
export type ModuleDraft = { version: 1; past: DraftSnapshot[]; present: DraftSnapshot; future: DraftSnapshot[] };
export const EMPTY_MODULE_DRAFT: ModuleDraft = { version: 1, past: [], present: { prompt: "", plan: null, manifest: null }, future: [] };
const MAX_BYTES = 900000;
const snapshotShape = z.strictObject({ prompt: z.string().max(6000), plan: z.unknown(), manifest: z.unknown() });
const historyShape = z.strictObject({ version: z.literal(1), past: z.array(snapshotShape).max(20), present: snapshotShape, future: z.array(snapshotShape).max(20) });

function parseSnapshot(input: unknown): DraftSnapshot {
  const snapshot = snapshotShape.parse(input);
  const plan = snapshot.plan === null ? null : parseModulePlan(snapshot.plan);
  const manifest = snapshot.manifest === null ? null : moduleManifestSchema.parse(snapshot.manifest);
  if (manifest) {
    const compiled = compileModulePlan(plan, true);
    if (compiled.error || JSON.stringify(compiled.value) !== JSON.stringify(manifest)) throw new Error("Manifest does not match its plan");
  }
  return { prompt: snapshot.prompt, plan, manifest };
}

export function parseModuleDraft(input: unknown): ModuleDraft {
  if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_BYTES) throw new Error("Draft too large");
  const state = historyShape.parse(input);
  if (state.past.length + state.future.length > 20) throw new Error("History too large");
  return { version: 1, present: parseSnapshot(state.present), past: state.past.map(parseSnapshot), future: state.future.map(parseSnapshot) };
}

export function changeModuleDraft(state: ModuleDraft, next: DraftSnapshot, coalesce = false): ModuleDraft {
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
  const result: ModuleDraft = { version: 1, past: coalesce ? [...state.past] : [...state.past, state.present].slice(-20), present: next, future: [] };
  while (result.past.length && new TextEncoder().encode(JSON.stringify(result)).length > MAX_BYTES) result.past.shift();
  return parseModuleDraft(result);
}

export function moveModuleDraft(state: ModuleDraft, direction: "undo" | "redo"): ModuleDraft {
  if (direction === "undo") {
    const previous = state.past.at(-1);
    return previous ? { version: 1, past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] } : state;
  }
  const next = state.future[0];
  return next ? { version: 1, past: [...state.past, state.present], present: next, future: state.future.slice(1) } : state;
}
