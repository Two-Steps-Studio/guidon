import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PROJECT_RESOURCES } from "@/lib/api/project-resources";
import { collectionRoutes, itemRoutes } from "@/lib/api/project-resource-routes";
import type { Dispatch } from "./dispatch";

/**
 * MCP tools for the project modules beyond tasks - five per module
 * (list_/get_/create_/update_/delete_), generated from the same
 * descriptions as their /api/v1 routes (lib/api/project-resources.ts), so a
 * new field or module shows up in both at once.
 */

const projectId = z.string().describe("The project's UUID (from list_projects).");

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const defined = (fields: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

export function registerProjectResourceTools(server: McpServer, dispatch: Dispatch): void {
  for (const resource of PROJECT_RESOURCES) {
    const collection = collectionRoutes(resource.path);
    const item = itemRoutes(resource.path);
    const words = resource.noun.replace(/_/g, " ");
    const itemId = z.string().describe(`The ${words}'s UUID (from list_${resource.plural}).`);
    const base = (project_id: string) => `/api/v1/projects/${project_id}/${resource.path}`;

    server.registerTool(
      `list_${resource.plural}`,
      {
        description: `${resource.summary}. Lists them for one project. Requires the project:read scope.`,
        inputSchema: { project_id: projectId },
        annotations: { title: `List ${resource.plural.replace(/_/g, " ")}`, ...READ_ONLY },
      },
      ({ project_id }) => dispatch(collection.GET, { projectId: project_id }, { method: "GET", path: base(project_id) })
    );

    server.registerTool(
      `get_${resource.noun}`,
      {
        description: `Get one ${words}. Requires the project:read scope.`,
        inputSchema: { project_id: projectId, id: itemId },
        annotations: { title: `Get ${words}`, ...READ_ONLY },
      },
      ({ project_id, id }) =>
        dispatch(item.GET, { projectId: project_id, itemId: id }, { method: "GET", path: `${base(project_id)}/${id}` })
    );

    server.registerTool(
      `create_${resource.noun}`,
      {
        description: `Add a ${words} to a project (${resource.summary.charAt(0).toLowerCase()}${resource.summary.slice(1)}). Requires the project:write scope.`,
        inputSchema: { project_id: projectId, ...resource.create.shape },
        annotations: { title: `Create ${words}`, ...WRITE },
      },
      ({ project_id, ...fields }) =>
        dispatch(collection.POST, { projectId: project_id }, { method: "POST", path: base(project_id), body: defined(fields) })
    );

    server.registerTool(
      `update_${resource.noun}`,
      {
        description: `Change some fields of a ${words}; only the fields you send change. Requires the project:write scope.`,
        inputSchema: { project_id: projectId, id: itemId, ...resource.update.shape },
        annotations: { title: `Update ${words}`, ...WRITE, idempotentHint: true },
      },
      ({ project_id, id, ...fields }) =>
        dispatch(
          item.PATCH,
          { projectId: project_id, itemId: id },
          { method: "PATCH", path: `${base(project_id)}/${id}`, body: defined(fields) }
        )
    );

    server.registerTool(
      `delete_${resource.noun}`,
      {
        description: `Delete a ${words} permanently. Requires the project:write scope (and a role that may delete).`,
        inputSchema: { project_id: projectId, id: itemId },
        annotations: { title: `Delete ${words}`, ...DESTRUCTIVE },
      },
      ({ project_id, id }) =>
        dispatch(item.DELETE, { projectId: project_id, itemId: id }, { method: "DELETE", path: `${base(project_id)}/${id}` })
    );
  }
}
