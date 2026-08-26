import "server-only";

import { z } from "zod";
import { sectionRegistry, findSection } from "./registry";
import { IdRemapper } from "./id-remapper";
import { SUPPORTED_GUIDON_VERSION } from "./types";
import type { TaskBoardData } from "./sections/task-board";
import type { RoadmapData } from "./sections/roadmap";

const GuidonFileShapeSchema = z.object({
  guidonVersion: z.string(),
  exportedAt: z.string(),
  project: z.object({ name: z.string().min(1), description: z.string().nullable() }),
  sections: z.record(z.string(), z.unknown()),
});

export interface GuidonImportPreview {
  projectName: string;
  projectDescription: string | null;
  taskCount: number;
  phaseCount: number;
  warnings: string[];
}

export interface ValidatedGuidonImport {
  projectName: string;
  projectDescription: string | null;
  /** Keyed by section key, each value already parsed against that section's own zod schema. */
  validatedSections: Map<string, unknown>;
  warnings: string[];
}

export type ValidateGuidonFileResult =
  | { ok: true; result: ValidatedGuidonImport }
  | { ok: false; error: string };

/**
 * Parses and fully validates a `.guidon` file: JSON shape, per-section
 * schemas (unknown section keys are skipped with a warning, not a failure -
 * forward compatibility with files from a newer Guidon version), and the
 * one cross-section consistency check this format actually needs -
 * `roadmap.phases[].taskLocalIds` and `taskBoard.tasks[].parentTaskLocalId`
 * must reference a task that exists in this same file. Nothing is written
 * to the database here - this is pure validation, called before any writes
 * for a bad file to guarantee it writes nothing at all.
 */
export function validateGuidonFile(raw: string): ValidateGuidonFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }

  const topLevel = GuidonFileShapeSchema.safeParse(parsed);
  if (!topLevel.success) {
    return {
      ok: false,
      error: "This doesn't look like a .guidon file (missing guidonVersion/project/sections).",
    };
  }

  const file = topLevel.data;
  const warnings: string[] = [];

  if (file.guidonVersion !== SUPPORTED_GUIDON_VERSION) {
    warnings.push(
      `This file was exported by a different Guidon format version (${file.guidonVersion}, expected ${SUPPORTED_GUIDON_VERSION}) - some data may not import correctly.`
    );
  }

  const validatedSections = new Map<string, unknown>();

  for (const [key, rawSectionData] of Object.entries(file.sections)) {
    const section = findSection(key);
    if (!section) {
      warnings.push(`Unknown section "${key}" was skipped (probably exported by a newer version of Guidon).`);
      continue;
    }

    const result = section.schema.safeParse(rawSectionData);
    if (!result.success) {
      return {
        ok: false,
        error: `Section "${key}" failed validation: ${result.error.issues[0]?.message ?? "invalid data"}`,
      };
    }
    validatedSections.set(key, result.data);
  }

  const taskBoard = validatedSections.get("taskBoard") as TaskBoardData | undefined;
  const roadmap = validatedSections.get("roadmap") as RoadmapData | undefined;
  const knownTaskLocalIds = new Set((taskBoard?.tasks ?? []).map((task) => task.localId));

  if (roadmap) {
    for (const phase of roadmap.phases) {
      for (const taskLocalId of phase.taskLocalIds ?? []) {
        if (!knownTaskLocalIds.has(taskLocalId)) {
          return {
            ok: false,
            error: `Roadmap phase "${phase.name}" references task "${taskLocalId}", which doesn't exist in this file's task board.`,
          };
        }
      }
    }
  }

  if (taskBoard) {
    for (const task of taskBoard.tasks) {
      if (task.parentTaskLocalId && !knownTaskLocalIds.has(task.parentTaskLocalId)) {
        return {
          ok: false,
          error: `Task "${task.title}" references a parent task ("${task.parentTaskLocalId}") that doesn't exist in this file.`,
        };
      }
    }
  }

  return {
    ok: true,
    result: {
      projectName: file.project.name,
      projectDescription: file.project.description,
      validatedSections,
      warnings,
    },
  };
}

export function summarizeGuidonImport(result: ValidatedGuidonImport): GuidonImportPreview {
  const taskBoard = result.validatedSections.get("taskBoard") as TaskBoardData | undefined;
  const roadmap = result.validatedSections.get("roadmap") as RoadmapData | undefined;

  return {
    projectName: result.projectName,
    projectDescription: result.projectDescription,
    taskCount: taskBoard?.tasks.length ?? 0,
    phaseCount: roadmap?.phases.length ?? 0,
    warnings: result.warnings,
  };
}

/**
 * Writes an already-validated import into `projectId` (a freshly created
 * project for "new" mode, or an existing one for "overwrite" mode - the
 * caller decides which and pre-checks permissions; this function just
 * writes). Runs sections in registry order so `taskBoard` (tasks) always
 * lands before `roadmap` (which resolves task ids through `idMap`).
 *
 * Each section's own writes are atomic on the direct-Postgres path (one
 * `withUser()` call per section), but sections are not wrapped in one
 * overarching transaction together - by the time any section starts
 * writing, the whole file has already passed `validateGuidonFile`, which is
 * the guarantee this format actually needs (a bad file writes nothing); a
 * genuine mid-import infrastructure failure between two sections is not
 * rolled back, matching every other multi-step mutation in this codebase.
 */
export async function runGuidonImport(
  projectId: string,
  userId: string,
  result: ValidatedGuidonImport
): Promise<void> {
  const idMap = new IdRemapper();

  for (const section of sectionRegistry) {
    const data = result.validatedSections.get(section.key);
    if (data === undefined) continue; // section absent from the file - leave that data untouched
    await section.importData(projectId, userId, data, idMap);
  }
}
