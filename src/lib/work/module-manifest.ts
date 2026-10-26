import { z } from "zod";

const identifier = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);
const displayName = z.string().trim().min(1).max(100);

const numericIdentifier = "(?:0|[1-9]\\d*)";
const prereleaseIdentifier = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const semverPattern = new RegExp(
  `^(${numericIdentifier})\\.(${numericIdentifier})\\.(${numericIdentifier})(?:-(${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`
);
const semanticVersion = z.string().min(1).max(128).regex(semverPattern, "Use a SemVer 2.0.0 version, such as 1.2.3.");

const permission = z.enum([
  "project:read",
  "tasks:read",
  "tasks:write",
  "decisions:read",
  "knowledge:read",
  "module-data:read",
  "module-data:write",
]);

const fieldBase = {
  id: identifier,
  name: displayName,
  required: z.boolean().default(false),
};

export const moduleFieldSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...fieldBase, type: z.literal("text"), maxLength: z.number().int().min(1).max(10_000).optional() }),
  z.strictObject({ ...fieldBase, type: z.literal("number"), min: z.number().finite().optional(), max: z.number().finite().optional() }),
  z.strictObject({ ...fieldBase, type: z.literal("boolean") }),
  z.strictObject({ ...fieldBase, type: z.literal("date") }),
  /** HTTP(S) address, shown as a link (engine 1.1). */
  z.strictObject({ ...fieldBase, type: z.literal("url") }),
  z.strictObject({
    ...fieldBase,
    type: z.literal("select"),
    options: z.array(z.strictObject({ value: identifier, label: displayName })).min(1).max(50),
  }),
]);

export const moduleEntitySchema = z.strictObject({
  id: identifier,
  name: displayName,
  fields: z.array(moduleFieldSchema).max(50),
});

const viewBase = {
  id: identifier,
  name: displayName,
  entity: identifier,
  fields: z.array(identifier).min(1).max(50),
};
const blockTitle = displayName;
/**
 * Blocks of a page view (engine 1.1). `text` is the author's fixed copy; the
 * other blocks show the records of one entity, so everything a project writes
 * is module data and a new version of the module never overwrites it.
 */
export const modulePageBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), title: blockTitle, text: z.string().trim().min(1).max(4000) }),
  z.strictObject({ type: z.literal("notes"), title: blockTitle, entity: identifier, field: identifier }),
  z.strictObject({ type: z.literal("checklist"), title: blockTitle, entity: identifier, labelField: identifier, doneField: identifier }),
  z.strictObject({ type: z.literal("links"), title: blockTitle, entity: identifier, labelField: identifier, urlField: identifier }),
]);
export type ModulePageBlock = z.infer<typeof modulePageBlockSchema>;

const moduleViewSchema = z.discriminatedUnion("type", [
  z.strictObject({ id: identifier, name: displayName, type: z.literal("page"), blocks: z.array(modulePageBlockSchema).min(1).max(20) }),
  z.strictObject({ ...viewBase, type: z.literal("table") }),
  z.strictObject({ ...viewBase, type: z.literal("form") }),
  z.strictObject({ ...viewBase, type: z.literal("board"), groupBy: identifier.optional() }),
  z.strictObject({ ...viewBase, type: z.literal("chart"), groupBy: identifier }),
  z.strictObject({ ...viewBase, type: z.literal("calendar"), dateField: identifier }),
]);

const migrationOperationSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add_entity"), entity: moduleEntitySchema }),
  z.strictObject({ op: z.literal("add_field"), entity: identifier, field: moduleFieldSchema }),
]);

const moduleMigrationSchema = z.strictObject({
  fromVersion: z.number().int().min(1).max(999),
  toVersion: z.number().int().min(2).max(1000),
  operations: z.array(migrationOperationSchema).min(1).max(100),
});

const engineCompatibilitySchema = z.strictObject({
  minVersion: semanticVersion,
  maxVersionExclusive: semanticVersion.optional(),
});

const lifecycleSchema = z.strictObject({
  install: z.literal("declarative"),
  enable: z.literal("immediate"),
  disable: z.literal("immediate"),
  uninstall: z.literal("retain_data"),
});

const safeLifecycle = {
  install: "declarative" as const,
  enable: "immediate" as const,
  disable: "immediate" as const,
  uninstall: "retain_data" as const,
};

/** Structural shape used to publish the JSON Schema. Cross-field checks live below. */
export const moduleManifestStructureSchema = z.strictObject({
  manifestVersion: z.literal(1),
  id: identifier,
  name: displayName,
  description: z.string().trim().max(500).optional(),
  version: semanticVersion,
  author: z.strictObject({ name: displayName }),
  engine: engineCompatibilitySchema,
  permissions: z.array(permission).max(20).default([]),
  entities: z.array(moduleEntitySchema).max(50).default([]),
  views: z.array(moduleViewSchema).max(50).default([]),
  dataVersion: z.number().int().min(1).max(1000).default(1),
  migrations: z.array(moduleMigrationSchema).max(999).default([]),
  lifecycle: lifecycleSchema.default(safeLifecycle),
});

export const moduleManifestSchema = moduleManifestStructureSchema.superRefine((manifest, ctx) => {
  if (manifest.engine.maxVersionExclusive && compareSemver(manifest.engine.minVersion, manifest.engine.maxVersionExclusive) >= 0) {
    ctx.addIssue({ code: "custom", path: ["engine", "maxVersionExclusive"], message: "Must be greater than minVersion." });
  }

  addDuplicateIssues(manifest.permissions, (value) => value, ctx, ["permissions"], "Permission scopes must be unique.");

  const entities = new Map<string, z.infer<typeof moduleEntitySchema>>();
  addDuplicateIssues(manifest.entities, (entity) => entity.id, ctx, ["entities"], "Entity IDs must be unique.");
  manifest.entities.forEach((entity, index) => {
    entities.set(entity.id, entity);
    addDuplicateIssues(entity.fields, (field) => field.id, ctx, ["entities", index, "fields"], "Field IDs must be unique within an entity.");
    entity.fields.forEach((field, fieldIndex) => {
      if (field.type === "number" && field.min !== undefined && field.max !== undefined && field.min > field.max) {
        ctx.addIssue({ code: "custom", path: ["entities", index, "fields", fieldIndex, "max"], message: "Must be greater than or equal to min." });
      }
      if (field.type === "select") {
        addDuplicateIssues(field.options, (option) => option.value, ctx, ["entities", index, "fields", fieldIndex, "options"], "Select option values must be unique.");
      }
    });
  });

  addDuplicateIssues(manifest.views, (view) => view.id, ctx, ["views"], "View IDs must be unique.");
  manifest.views.forEach((view, index) => {
    if (view.type === "page") {
      view.blocks.forEach((block, blockIndex) => {
        if (block.type === "text") return;
        const target = entities.get(block.entity);
        const path = ["views", index, "blocks", blockIndex];
        if (!target) {
          ctx.addIssue({ code: "custom", path: [...path, "entity"], message: "Block must reference a declared entity." });
          return;
        }
        const fieldOf = (id: string) => target.fields.find((field) => field.id === id);
        const expect = (id: string, types: string[], key: string) => {
          if (!types.includes(fieldOf(id)?.type ?? "")) ctx.addIssue({ code: "custom", path: [...path, key], message: `Block field must be a ${types.join("/")} field of its entity.` });
        };
        if (block.type === "notes") expect(block.field, ["text"], "field");
        if (block.type === "checklist") { expect(block.labelField, ["text"], "labelField"); expect(block.doneField, ["boolean"], "doneField"); }
        if (block.type === "links") { expect(block.labelField, ["text"], "labelField"); expect(block.urlField, ["url"], "urlField"); }
      });
      return;
    }
    const entity = entities.get(view.entity);
    if (!entity) {
      ctx.addIssue({ code: "custom", path: ["views", index, "entity"], message: "View must reference a declared entity." });
      return;
    }
    addDuplicateIssues(view.fields, (fieldId) => fieldId, ctx, ["views", index, "fields"], "View field IDs must be unique.");
    for (const [fieldIndex, fieldId] of view.fields.entries()) {
      if (!entity.fields.some((field) => field.id === fieldId)) {
        ctx.addIssue({ code: "custom", path: ["views", index, "fields", fieldIndex], message: "View field must exist on its entity." });
      }
    }
    if (view.type === "board" || view.type === "chart") {
      const groupBy = view.groupBy ?? entity.fields.find((field) => field.type === "select" && view.fields.includes(field.id))?.id;
      if (!groupBy || !entity.fields.some((field) => field.id === groupBy && field.type === "select") || !view.fields.includes(groupBy)) {
        ctx.addIssue({ code: "custom", path: ["views", index], message: "Board/chart requires a select groupBy field included in the view." });
      }
    }
    if (view.type === "calendar" && (!entity.fields.some((field) => field.id === view.dateField && field.type === "date") || !view.fields.includes(view.dateField))) {
      ctx.addIssue({ code: "custom", path: ["views", index], message: "Calendar requires a dateField included in the view." });
    }
  });

  const usesEngine11 = manifest.views.some((view) => view.type === "page") || manifest.entities.some((entity) => entity.fields.some((field) => field.type === "url"));
  if (usesEngine11 && compareSemver(manifest.engine.minVersion, "1.1.0") < 0) {
    ctx.addIssue({ code: "custom", path: ["engine", "minVersion"], message: "Page views and url fields need engine 1.1.0 or later." });
  }

  if (manifest.migrations.length !== manifest.dataVersion - 1) {
    ctx.addIssue({ code: "custom", path: ["migrations"], message: "Migrations must provide one additive step for each data-version increment." });
  }
  manifest.migrations.forEach((migration, index) => {
    if (migration.toVersion !== migration.fromVersion + 1) {
      ctx.addIssue({ code: "custom", path: ["migrations", index, "toVersion"], message: "Each migration must increment the data version by exactly one." });
    }
    if (migration.fromVersion !== index + 1 || migration.toVersion > manifest.dataVersion) {
      ctx.addIssue({ code: "custom", path: ["migrations", index], message: "Migrations must form an ordered chain from version 1 to dataVersion." });
    }
    migration.operations.forEach((operation, operationIndex) => {
      const targetEntityId = operation.op === "add_entity" ? operation.entity.id : operation.entity;
      if (!entities.has(targetEntityId)) {
        ctx.addIssue({ code: "custom", path: ["migrations", index, "operations", operationIndex], message: "Migration target must exist in the final entity schema." });
      }
      if (operation.op === "add_field" && !entities.get(operation.entity)?.fields.some((field) => field.id === operation.field.id)) {
        ctx.addIssue({ code: "custom", path: ["migrations", index, "operations", operationIndex, "field"], message: "Added field must exist in the final entity schema." });
      }
    });
  });
});

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

const structuralJsonSchema = z.toJSONSchema(moduleManifestStructureSchema, {
  target: "draft-2020-12",
  io: "input",
});

export const MODULE_MANIFEST_JSON_SCHEMA = {
  ...structuralJsonSchema,
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://useguidon.com/schemas/module-manifest/v1.json",
  title: "Guidon Module Manifest v1",
  "x-guidon-semantic-validation": [
    "engine.maxVersionExclusive must be greater than engine.minVersion",
    "permission names, entity IDs, field IDs, select option values, view IDs, and view field references are validated for uniqueness and referential integrity",
    "migrations must form an ordered additive chain from data version 1 to dataVersion",
    "page blocks reference declared entities and fields of the right type (notes: text; checklist: text label + boolean done; links: text label + url)",
    "page views and url fields require engine.minVersion 1.1.0 or later",
  ],
};

function addDuplicateIssues<T>(
  values: T[],
  key: (value: T) => string,
  ctx: z.RefinementCtx,
  path: (string | number)[],
  message: string
) {
  if (new Set(values.map(key)).size !== values.length) {
    ctx.addIssue({ code: "custom", path, message });
  }
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index++) {
    const diff = a.core[index] - b.core[index];
    if (diff !== BigInt(0)) return diff < BigInt(0) ? -1 : 1;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined || bPart === undefined) return aPart === undefined ? -1 : 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return BigInt(aPart) < BigInt(bPart) ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

function parseSemver(value: string) {
  const match = semverPattern.exec(value);
  if (!match) throw new Error("Expected validated SemVer input.");
  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])] as const,
    prerelease: match[4]?.split(".") ?? [],
  };
}
