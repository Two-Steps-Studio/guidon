import "server-only";

import { themeSection } from "./sections/theme";
import { taskBoardSection } from "./sections/task-board";
import { roadmapSection } from "./sections/roadmap";
import type { GuidonSection } from "./types";

/**
 * Array order doubles as import execution order - taskBoard must run
 * before roadmap, since phases' `taskLocalIds` resolve against tasks the
 * previous section already inserted (see IdRemapper).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a heterogeneous registry of GuidonSection<T> for different T is inherently untyped at this level; each entry is fully typed at its own definition.
export const sectionRegistry: GuidonSection<any>[] = [themeSection, taskBoardSection, roadmapSection];

export function findSection(key: string) {
  return sectionRegistry.find((section) => section.key === key) ?? null;
}
