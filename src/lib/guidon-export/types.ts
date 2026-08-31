import "server-only";

import type { z } from "zod";
import type { IdRemapper } from "./id-remapper";

/**
 * One independently pluggable slice of a `.guidon` file. Adding a future
 * section (Knowledge, Decisions, ...) is one new file implementing this
 * shape plus one line in `registry.ts` - nothing else in export/import/
 * validation needs to change.
 *
 * `userId` isn't part of the format the feature was specced with, but every
 * DB write in this codebase is scoped to an acting user for RLS
 * (`withUser(userId, ...)`) - sections need it to actually write anything.
 */
export interface GuidonSection<T> {
  key: string;
  schema: z.ZodType<T>;
  exportData(projectId: string, userId: string): Promise<T>;
  /**
   * Always full-replace semantics for this section's own data, scoped to
   * `projectId` - callers never need to know "new project" vs "overwrite
   * existing project" inside a section, since deleting an empty project's
   * (nonexistent) rows is a no-op and deleting an existing project's rows
   * is exactly what "overwrite" means.
   */
  importData(projectId: string, userId: string, data: T, idMap: IdRemapper): Promise<void>;
}

export const SUPPORTED_GUIDON_VERSION = "1.0";

export interface GuidonFileProject {
  name: string;
  description: string | null;
  /** One of the CHECK-constrained values from 023_project_type.sql, or null. */
  projectType: string | null;
}

export interface GuidonFile {
  guidonVersion: string;
  exportedAt: string;
  project: GuidonFileProject;
  sections: Record<string, unknown>;
}
