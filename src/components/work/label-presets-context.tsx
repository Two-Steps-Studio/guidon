"use client";

import { createContext, useContext } from "react";
import type { LabelPreset } from "@/lib/work/label-presets";

/**
 * The project's label presets (migration 053) for the work UI. A context
 * rather than a prop so TaskCard's memo() isn't threaded through yet another
 * prop on every card; the list only changes when settings are saved.
 * Outside a provider (e.g. the landing page's demo board) it's empty and
 * labels render uncoloured, as before.
 */
const LabelPresetsContext = createContext<readonly LabelPreset[]>([]);

export const LabelPresetsProvider = LabelPresetsContext.Provider;

export function useLabelPresets(): readonly LabelPreset[] {
  return useContext(LabelPresetsContext);
}
