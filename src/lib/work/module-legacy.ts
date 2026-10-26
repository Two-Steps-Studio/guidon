import { customModuleSchema, type CustomModule } from "./custom-modules";
import { moduleManifestSchema, type ModuleManifest } from "./module-manifest";
import { parseModuleRecords, type ModuleRecord } from "./module-records";

/**
 * Content modules (migration 079: text/checklist/links blocks stored on the
 * project) as page-view packages. Migration 092 runs the same conversion in
 * SQL for stored modules; this one converts exported/AI-written JSON on
 * import. Every block becomes an entity whose records hold what the project
 * wrote, so later edits are module data, never manifest changes.
 */
export function legacyModuleId(id: string, taken: ReadonlySet<string>): string | null {
  if (!taken.has(id)) return id;
  const fallback = `${id.slice(0, 59)}-page`;
  return taken.has(fallback) ? null : fallback;
}

export function convertContentModule(input: unknown, moduleId?: string, newId: () => string = () => crypto.randomUUID()): {
  manifest: ModuleManifest; records: ModuleRecord[]; settings: { category?: string };
} {
  const source: CustomModule = customModuleSchema.parse(input);
  const id = moduleId ?? source.id;
  const entities: unknown[] = [];
  const blocks: unknown[] = [];
  const records: unknown[] = [];
  source.blocks.forEach((block, index) => {
    const n = index + 1;
    if (block.type === "text") {
      const entity = `notes-${n}`;
      entities.push({ id: entity, name: block.title, fields: [{ id: "text", name: "Text", type: "text", required: true, maxLength: 4000 }] });
      blocks.push({ type: "notes", title: block.title, entity, field: "text" });
      records.push({ id: newId(), entity, values: { text: block.text } });
    } else if (block.type === "checklist") {
      const entity = `checklist-${n}`;
      entities.push({ id: entity, name: block.title, fields: [
        { id: "label", name: "Item", type: "text", required: true, maxLength: 200 },
        { id: "done", name: "Done", type: "boolean", required: false },
      ] });
      blocks.push({ type: "checklist", title: block.title, entity, labelField: "label", doneField: "done" });
      for (const item of block.items) records.push({ id: newId(), entity, values: { label: item.label, done: item.done } });
    } else {
      const entity = `links-${n}`;
      entities.push({ id: entity, name: block.title, fields: [
        { id: "label", name: "Label", type: "text", required: true, maxLength: 200 },
        { id: "url", name: "URL", type: "url", required: true },
      ] });
      blocks.push({ type: "links", title: block.title, entity, labelField: "label", urlField: "url" });
      for (const item of block.items) records.push({ id: newId(), entity, values: { label: item.label, url: item.url } });
    }
  });
  const manifest = moduleManifestSchema.parse({
    manifestVersion: 1, id, name: source.title, ...(source.description ? { description: source.description } : {}),
    version: "1.0.0", author: { name: "Project" }, engine: { minVersion: "1.1.0" },
    permissions: ["module-data:read", "module-data:write"],
    entities, views: [{ id: "page", name: source.title, type: "page", blocks }],
  });
  return { manifest, records: parseModuleRecords(manifest, records), settings: source.category ? { category: source.category } : {} };
}
