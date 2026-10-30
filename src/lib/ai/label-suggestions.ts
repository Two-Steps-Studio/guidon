import { LABEL_COLORS, LABEL_NAME_MAX_LENGTH, isValidLabelColor } from "../work/label-presets";

export type LabelSuggestion = { name: string; color: string };

/** Model output is untrusted; suggestions never rename/delete existing labels. */
export function parseLabelSuggestions(text: string, existing: readonly string[]): LabelSuggestion[] {
  if (text.length > 16000) return [];
  const json = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try { value = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const taken = new Set(existing.map(name => name.trim().toLowerCase()));
  const result: LabelSuggestion[] = [];
  for (const row of value.slice(0, 20)) {
    if (!row || typeof row !== "object" || typeof row.name !== "string") continue;
    const name = row.name.trim();
    if (!name || name.length > LABEL_NAME_MAX_LENGTH || /[,\x00-\x1f\x7f]/.test(name) || taken.has(name.toLowerCase())) continue;
    const color = typeof row.color === "string" && isValidLabelColor(row.color) ? row.color : LABEL_COLORS[result.length % LABEL_COLORS.length];
    taken.add(name.toLowerCase());
    result.push({ name, color });
    if (result.length === 10) break;
  }
  return result;
}
