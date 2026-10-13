import "server-only";

import { dataClient } from "@/lib/data-client";
import type { LabelPreset } from "@/lib/work/label-presets";

/** RLS (053) limits this to members of the project; anyone else gets []. */
export async function getLabelPresets(userId: string, projectId: string): Promise<LabelPreset[]> {
  const { data, error } = await dataClient(userId)
    .from<LabelPreset>("project_label_presets")
    .select("id, name, color, sort_order")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("name");
  if (error) {
    console.error("getLabelPresets failed:", error.message);
    return [];
  }
  return data ?? [];
}
