// No server-only imports: used by the work board, task dialog and settings form.

/**
 * A project's predefined task label (migration 053). Tasks still store their
 * labels as plain strings in tasks.tags - a preset only adds a colour and
 * makes the name one tap away when editing a task. Labels outside the
 * presets stay allowed.
 */
export interface LabelPreset {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export const LABEL_NAME_MAX_LENGTH = 40;

/** Swatches offered in the settings form (Tailwind 500 shades). */
export const LABEL_COLORS = [
  "#64748b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isValidLabelColor(color: string): boolean {
  return HEX_COLOR.test(color);
}

/** Case-insensitive, matching the unique index on (project_id, lower(name)). */
export function findLabelPreset(presets: readonly LabelPreset[], tag: string): LabelPreset | undefined {
  const key = tag.trim().toLowerCase();
  return presets.find((preset) => preset.name.toLowerCase() === key);
}
