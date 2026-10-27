/**
 * Guidon Module SDK v1 (engine 1.3): the typings the code editor gives
 * Monaco, and the starting script. Keep in step with WORKER_PRELUDE and
 * parseUiTree in module-sandbox.ts - docs/module-sandbox.md documents both.
 */
export const MODULE_SDK_DTS = `
type Value = string | number | boolean | null;
/** One entry of this module, as stored. Read-only: ask for changes with onAction. */
interface ModuleRecord { readonly id: string; readonly entity: string; readonly values: Readonly<Record<string, Value>> }
interface ModuleField { id: string; name: string; type: "text" | "number" | "boolean" | "date" | "select" | "url"; required: boolean; options?: { value: string; label: string }[] }
interface ModuleEntity { id: string; name: string; fields: ModuleField[] }
interface Context {
  /** Every entry of this module (up to 1,000). */
  readonly records: readonly ModuleRecord[];
  /** The module's entities and fields. */
  readonly entities: readonly ModuleEntity[];
  /** Current values of the inputs/checkboxes you rendered, by name. */
  readonly form: Readonly<Record<string, string | boolean>>;
  /** Whether the viewer may change entries (project owner/admin). */
  readonly canWrite: boolean;
}
type UiNode =
  | { type: "stack" | "row" | "list"; children: UiNode[] }
  | { type: "heading" | "badge"; text: string }
  | { type: "text"; text: string; tone?: "muted" | "danger" | "success" }
  | { type: "button"; label: string; action: string; payload?: Value; variant?: "primary" | "outline" | "danger" }
  | { type: "input"; name: string; label: string; kind?: "text" | "number" | "date"; value?: string }
  | { type: "checkbox"; name: string; label: string; checked?: boolean }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "progress"; value: number; max: number; label?: string };
/** Entries to add or replace (by id) and ids to remove. Validated against the module's fields before saving. */
interface Change { upsert?: { id?: string; entity: string; values: Record<string, Value> }[]; remove?: string[] }
interface ModuleDefinition {
  /** Draw the module. Called on load, after every action and when entries change. Must return within 2 seconds. */
  render(ctx: Context): UiNode;
  /** A button was pressed. Return the change to save, or nothing. */
  onAction?(action: string, payload: Value, ctx: Context): Change | null | undefined | void;
}
declare const guidon: { module(definition: ModuleDefinition): void };
/** Shown in the editor's log (not in the browser console). */
declare const console: { log(...values: unknown[]): void; info(...values: unknown[]): void; warn(...values: unknown[]): void; error(...values: unknown[]): void };
`;

export const MODULE_SCRIPT_TEMPLATE = `// Guidon module script - runs in a sandbox: no network, no page access.
// render(ctx) returns the UI; onAction(action, payload, ctx) returns entries to save.
guidon.module({
  render(ctx) {
    const entity = ctx.entities[0];
    const rows = entity ? ctx.records.filter((record) => record.entity === entity.id) : [];
    return {
      type: "stack",
      children: [
        { type: "heading", text: entity ? \`\${entity.name}: \${rows.length}\` : "No entities yet" },
        { type: "list", children: rows.slice(0, 20).map((record) => ({ type: "text", text: Object.values(record.values).join(" · ") })) },
        ...(entity && ctx.canWrite ? [
          { type: "input", name: "first", label: entity.fields[0]?.name ?? "Value" },
          { type: "button", label: "Add", action: "add" },
        ] : []),
      ],
    };
  },
  onAction(action, payload, ctx) {
    const entity = ctx.entities[0];
    if (action !== "add" || !entity || !entity.fields[0]) return null;
    const value = String(ctx.form.first ?? "").trim();
    if (!value) return null;
    return { upsert: [{ entity: entity.id, values: { [entity.fields[0].id]: value } }] };
  },
});
`;
