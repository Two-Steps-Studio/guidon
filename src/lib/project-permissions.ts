import type { ProjectRole } from "@/types/project";

/**
 * What each project role may do - the one table both the permission checks
 * (src/lib/data/project-access.ts) and the "What each role can do" table on
 * the Members page read, so the page can't promise something the server
 * refuses. RLS (src/db/migrations) remains the real boundary; it agrees with
 * this table and test:db checks each role against it.
 */
export const PROJECT_ROLES = ["owner", "admin", "developer", "tester", "viewer"] as const satisfies readonly ProjectRole[];

export const PROJECT_CAPABILITIES = {
  /** Tasks, decisions, knowledge, roadmap, files. */
  view: ["owner", "admin", "developer", "tester", "viewer"],
  /** Comments and attachments on tasks. */
  comment: ["owner", "admin", "developer", "tester"],
  /** Create, edit and move tasks; write decisions, knowledge and memory; upload files. */
  edit: ["owner", "admin", "developer"],
  /** Delete tasks, decisions, notes and files. */
  delete: ["owner", "admin"],
  /** Members, settings, roadmap, board columns, modules and integrations. */
  manage: ["owner", "admin"],
  /** Change or remove owners, delete the project (projects_delete is owner-only). */
  own: ["owner"],
} as const satisfies Record<string, readonly ProjectRole[]>;

export type ProjectCapability = keyof typeof PROJECT_CAPABILITIES;

export function roleCan(role: ProjectRole | null, capability: ProjectCapability): boolean {
  return role !== null && (PROJECT_CAPABILITIES[capability] as readonly ProjectRole[]).includes(role);
}
