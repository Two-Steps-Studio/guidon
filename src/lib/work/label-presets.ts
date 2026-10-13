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

/**
 * Starter sets offered in project settings, so a team from any field gets a
 * sensible label vocabulary in one click instead of typing it up. Names come
 * from messages (settings.labelStarter.<set>.<key>) in the user's language;
 * adding a set skips names the project already has.
 */
export const LABEL_STARTER_SETS = {
  software: [
    ["bug", "#ef4444"],
    ["feature", "#3b82f6"],
    ["improvement", "#14b8a6"],
    ["techDebt", "#64748b"],
    ["docs", "#8b5cf6"],
  ],
  gamedev: [
    ["bug", "#ef4444"],
    ["gameplay", "#3b82f6"],
    ["art", "#ec4899"],
    ["audio", "#8b5cf6"],
    ["levelDesign", "#22c55e"],
    ["performance", "#f97316"],
  ],
  design: [
    ["research", "#14b8a6"],
    ["wireframe", "#64748b"],
    ["visual", "#ec4899"],
    ["feedback", "#eab308"],
    ["handoff", "#3b82f6"],
  ],
  marketing: [
    ["campaign", "#3b82f6"],
    ["content", "#8b5cf6"],
    ["social", "#ec4899"],
    ["seo", "#22c55e"],
    ["ads", "#f97316"],
  ],
  support: [
    ["bug", "#ef4444"],
    ["question", "#3b82f6"],
    ["featureRequest", "#8b5cf6"],
    ["urgent", "#f97316"],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [string, string]>>;

export type LabelStarterSet = keyof typeof LABEL_STARTER_SETS;
