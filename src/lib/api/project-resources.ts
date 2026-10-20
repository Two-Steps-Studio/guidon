import { z } from "zod";
import type { ActivityAction } from "@/types/api";

/**
 * The project modules beyond tasks - decisions, knowledge sources, roadmap
 * phases, memory, tech stack - described once, as data. From this one
 * description come:
 * - the /api/v1/projects/{projectId}/<path> routes (project-resource-routes.ts),
 * - the MCP tools list_/get_/create_/update_/delete_<noun> (mcp/http/tools.ts),
 * - their part of the OpenAPI document (openapi.ts),
 * so an agent can manage a whole project, not only its board, and the three
 * descriptions can't drift apart.
 *
 * The database stays the authority: RLS decides who may write what (a
 * viewer's key can read but not write), CHECK constraints the allowed
 * values. These schemas mirror them to give a readable 400 first.
 */

export interface ProjectResource {
  /** URL segment: /api/v1/projects/{projectId}/<path>. */
  path: string;
  /** Response keys: { <listKey>: [...] } and { <itemKey>: {...} }. */
  listKey: string;
  itemKey: string;
  /** MCP tool noun: list_<plural>, create_<noun>... */
  noun: string;
  plural: string;
  /** One line for tool/OpenAPI descriptions. */
  summary: string;
  table: string;
  /** POST body. */
  create: z.ZodObject<z.ZodRawShape>;
  /** PATCH body - every field optional, at least one required. */
  update: z.ZodObject<z.ZodRawShape>;
  /** Columns the server sets on create from the caller's identity. */
  onCreate?: (userId: string) => Record<string, unknown>;
  /**
   * numeric columns: Postgres returns them as strings through `pg` (self-
   * hosted) but as numbers through PostgREST - turned into numbers so both
   * modes answer the same.
   */
  numeric?: string[];
  order: { column: string; ascending: boolean }[];
  activity?: {
    entityType: string;
    created?: ActivityAction;
    updated?: ActivityAction;
    title: (row: Record<string, unknown>) => string;
  };
}

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
// No transforms anywhere here: these also become JSON Schema (MCP, OpenAPI).
const isoDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/** PATCH = the create fields, all optional; nullable where the column is. */
function patchOf(shape: Record<string, z.ZodType>, nullable: string[]): z.ZodObject<z.ZodRawShape> {
  const out: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(shape)) {
    const base = field instanceof z.ZodOptional ? (field.unwrap() as z.ZodType) : field;
    out[key] = (nullable.includes(key) ? base.nullable() : base).optional().describe(field.description ?? "");
  }
  return z.object(out).strict();
}

// ---------------------------------------------------------------- decisions

export const DECISION_STATUSES = ["proposed", "approved", "rejected", "deprecated"] as const;
export const DECISION_TYPES = ["technical", "architectural", "product", "business", "process", "other"] as const;

const decisionFields = {
  title: required(300).describe("What was decided, in a line."),
  description: text(20000).optional().describe("The decision and its reasoning (Markdown)."),
  impact: text(5000).optional().describe("What it affects."),
  alternatives: z.array(text(500)).max(20).optional().describe("Options considered and not chosen."),
  status: z.enum(DECISION_STATUSES).optional().describe("Defaults to proposed - a human approves."),
  decision_type: z.enum(DECISION_TYPES).optional().describe("Defaults to other."),
};

// ---------------------------------------------------------------- knowledge

export const SOURCE_TYPES = [
  "document",
  "comment",
  "commit",
  "pull_request",
  "issue",
  "external_url",
  "meeting",
  "file",
  "other",
] as const;

const sourceFields = {
  title: required(300).describe("Short name of the source."),
  source_type: z.enum(SOURCE_TYPES).optional().describe("Defaults to document."),
  content: text(50000).optional().describe("The text itself, or notes about it (Markdown)."),
  url: z.url().max(2000).optional().describe("Where it lives, if anywhere."),
};

// ---------------------------------------------------------------- roadmap

export const PHASE_STATUSES = ["planned", "in_progress", "completed", "blocked"] as const;

const phaseFields = {
  name: required(200).describe("Phase name, e.g. \"Vertical slice\"."),
  description: text(10000).optional().describe("Goals and scope of the phase."),
  status: z.enum(PHASE_STATUSES).optional().describe("Defaults to planned."),
  start_date: isoDate.optional().describe("ISO 8601 date."),
  planned_end_date: isoDate.optional().describe("ISO 8601 date."),
  actual_end_date: isoDate.optional().describe("ISO 8601 date, once finished."),
  completion_percentage: z.number().int().min(0).max(100).optional().describe("0-100."),
  sort_order: z.number().int().optional().describe("Position on the roadmap, lowest first."),
};

// ---------------------------------------------------------------- memory

export const MEMORY_TYPES = [
  "fact",
  "project_rule",
  "constraint",
  "preference",
  "decision_summary",
  "observation",
  "ai_insight",
] as const;

const memoryFields = {
  content: required(5000).describe("One thing worth remembering about the project."),
  memory_type: z.enum(MEMORY_TYPES).optional().describe("Defaults to observation."),
  confidence: z.number().min(0).max(1).optional().describe("0-1, how sure you are."),
};

// ---------------------------------------------------------------- tech stack

export const TECH_CATEGORIES = ["frontend", "backend", "game_engine", "database", "devops", "ai", "other"] as const;

const technologyFields = {
  name: required(100).describe("e.g. Unity, Godot, PostgreSQL."),
  version: text(50).optional().describe("e.g. 6000.0 LTS."),
  category: z.enum(TECH_CATEGORIES).optional().describe("Defaults to other."),
  description: text(2000).optional().describe("What it's used for here."),
  icon_slug: text(100).optional().describe("Simple Icons slug for the logo, e.g. unity."),
  sort_order: z.number().int().optional(),
};

const titleOf = (key: string) => (row: Record<string, unknown>) => String(row[key] ?? "").slice(0, 120);

export const PROJECT_RESOURCES: ProjectResource[] = [
  {
    path: "decisions",
    listKey: "decisions",
    itemKey: "decision",
    noun: "decision",
    plural: "decisions",
    summary: "Architecture/product decisions and why they were made",
    table: "context_decisions",
    create: z.object(decisionFields).strict(),
    update: patchOf(decisionFields, ["description", "impact"]),
    onCreate: (userId) => ({ made_by: userId, made_at: new Date().toISOString() }),
    order: [{ column: "created_at", ascending: false }],
    activity: { entityType: "decision", created: "decision_created", updated: "decision_updated", title: titleOf("title") },
  },
  {
    path: "knowledge",
    listKey: "sources",
    itemKey: "source",
    noun: "knowledge_source",
    plural: "knowledge_sources",
    summary: "The project's knowledge base: documents, links, meeting notes",
    table: "context_sources",
    create: z.object(sourceFields).strict(),
    update: patchOf(sourceFields, ["content", "url"]),
    onCreate: (userId) => ({ author: userId }),
    order: [{ column: "created_at", ascending: false }],
    activity: { entityType: "source", created: "source_created", updated: "source_updated", title: titleOf("title") },
  },
  {
    path: "roadmap",
    listKey: "phases",
    itemKey: "phase",
    noun: "roadmap_phase",
    plural: "roadmap_phases",
    summary: "Roadmap phases/milestones with dates and progress",
    table: "roadmap_phases",
    create: z.object(phaseFields).strict(),
    update: patchOf(phaseFields, ["description", "start_date", "planned_end_date", "actual_end_date", "sort_order"]),
    onCreate: (userId) => ({ created_by: userId }),
    order: [
      { column: "sort_order", ascending: true },
      { column: "created_at", ascending: true },
    ],
    activity: { entityType: "phase", created: "phase_created", updated: "phase_updated", title: titleOf("name") },
  },
  {
    path: "memory",
    listKey: "memories",
    itemKey: "memory",
    noun: "memory",
    plural: "memories",
    summary:
      "Project memory: facts, rules, constraints and observations agents should know. Entries added here start unverified until a person verifies them",
    table: "project_memory",
    create: z.object(memoryFields).strict(),
    update: patchOf(memoryFields, ["confidence"]),
    // Never verified by an API caller - a person does that in the app.
    onCreate: (userId) => ({ created_by: userId, verified: false }),
    numeric: ["confidence"],
    order: [{ column: "created_at", ascending: false }],
    activity: { entityType: "memory", created: "memory_created", updated: "memory_updated", title: titleOf("content") },
  },
  {
    path: "technologies",
    listKey: "technologies",
    itemKey: "technology",
    noun: "technology",
    plural: "technologies",
    summary: "The project's tech stack: engines, languages, services",
    table: "technologies",
    create: z.object(technologyFields).strict(),
    update: patchOf(technologyFields, ["version", "description", "icon_slug", "sort_order"]),
    order: [
      { column: "sort_order", ascending: true },
      { column: "name", ascending: true },
    ],
  },
];

/** Column defaults the database doesn't have, applied on create. */
export const CREATE_DEFAULTS: Record<string, Record<string, unknown>> = {
  context_sources: { source_type: "document" },
  project_memory: { memory_type: "observation" },
};

export function projectResource(path: string): ProjectResource {
  const resource = PROJECT_RESOURCES.find((r) => r.path === path);
  if (!resource) throw new Error(`Unknown project resource "${path}"`);
  return resource;
}
