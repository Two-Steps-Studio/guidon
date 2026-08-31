import "server-only";

import { sectionRegistry } from "./registry";
import { SUPPORTED_GUIDON_VERSION, type GuidonFile } from "./types";

function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-");
  return cleaned.length > 0 ? cleaned : "project";
}

export interface ExportedGuidonFile {
  filename: string;
  json: GuidonFile;
}

/** Assembles a full `.guidon` file for `projectId` by asking every registered section for its data. */
export async function exportProjectToFile(
  projectId: string,
  userId: string,
  project: { name: string; description: string | null; projectType: string | null }
): Promise<ExportedGuidonFile> {
  const sections: Record<string, unknown> = {};

  for (const section of sectionRegistry) {
    sections[section.key] = await section.exportData(projectId, userId);
  }

  const json: GuidonFile = {
    guidonVersion: SUPPORTED_GUIDON_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name: project.name, description: project.description, projectType: project.projectType },
    sections,
  };

  return { filename: `${sanitizeFilename(project.name)}.guidon`, json };
}
