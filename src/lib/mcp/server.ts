import "server-only";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getProjectAccess } from "@/lib/data/project-access";
import { getTaskAgentContext } from "@/lib/context/agent-context";
import { updateTask, createTask, deleteTask } from "@/app/projects/[id]/work/actions";
import { createMemory, updateMemory, deleteMemory } from "@/app/projects/[id]/memory/actions";

/**
 * GuidonMCPServer exposes Guidon's internal data and actions as MCP Resources and Tools.
 *
 * It requires user identity to be propagated to enforce RLS and project-level permissions.
 */
export class GuidonMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "guidon-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupResources();
    this.setupTools();
  }

  private setupResources() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "guidon://project/{projectId}/task/{taskId}/context",
            name: "Task Agent Context",
            description: "The complete Markdown context package for a specific task, including project memory and relations.",
            mimeType: "text/markdown",
          },
          {
            uri: "guidon://project/{projectId}/memory",
            name: "Project Memory",
            description: "All recorded project memory entries (facts, constraints, rules).",
            mimeType: "text/markdown",
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      // Handle guidon://project/{id}/task/{taskId}/context
      const taskMatch = uri.match(/^guidon:\/\/project\/([^\/]+)\/task\/([^\/]+)\/context$/);
      if (taskMatch) {
        const [, projectId, taskId] = taskMatch;
        const context = await getTaskAgentContext(projectId, taskId);
        if (context.error) {
          throw new Error(context.error);
        }
        return {
          contents: [{
            uri,
            mimeType: "text/markdown",
            text: context.markdown,
          }],
        };
      }

      throw new Error(`Unsupported resource URI: ${uri}`);
    });
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "update_task_status",
            description: "Update the status of a task in Guidon.",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                taskId: { type: "string" },
                status: {
                  type: "string",
                  enum: ["backlog", "todo", "in_progress", "ai_working", "review", "done"]
                },
                sortOrder: { type: "number" },
              },
              required: ["projectId", "taskId", "status"],
            },
          },
          {
            name: "create_task",
            description: "Create a new task in a project.",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                status: { type: "string", enum: ["backlog", "todo", "in_progress", "ai_working", "review", "done"] },
                priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                assigneeId: { type: "string" },
                dueDate: { type: "string" },
                sortOrder: { type: "number" },
              },
              required: ["projectId", "title", "status", "priority"],
            },
          },
          {
            name: "add_project_memory",
            description: "Add a new memory entry (fact, rule, constraint, etc.) to the project.",
            inputSchema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                content: { type: "string" },
                memoryType: {
                  type: "string",
                  enum: ["fact", "project_rule", "constraint", "preference", "decision_summary", "observation", "ai_insight"]
                },
              },
              required: ["projectId", "content", "memoryType"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "update_task_status") {
        const { projectId, taskId, status, sortOrder = 0 } = args as any;
        const result = await updateTask(projectId, taskId, { status } as any); // Simplified patch
        if (result.error) throw new Error(result.error);
        return {
          content: [{ type: "text", text: `Successfully updated task ${taskId} to status ${status}.` }],
        };
      }

      if (name === "create_task") {
        const { projectId, title, description, status, priority, assigneeId, dueDate, sortOrder = 0 } = args as any;
        const result = await createTask(projectId, {
          title, description, status, priority, assigneeId, dueDate, sortOrder
        });
        if (result.error) throw new Error(result.error);
        return {
          content: [{ type: "text", text: `Successfully created task ${result.task?.id} with title "${title}".` }],
        };
      }

      if (name === "add_project_memory") {
        const { projectId, content, memoryType } = args as any;
        // createMemory expects FormData, so we simulate it
        const formData = new FormData();
        formData.append("content", content);
        formData.append("memory_type", memoryType);

        const result = await createMemory(projectId, { error: null }, formData);
        if (result.error) throw new Error(result.error);
        return {
          content: [{ type: "text", text: `Successfully added ${memoryType} to project memory.` }],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Guidon MCP Server started on stdio");
  }
}

export const guidonMCPServer = new GuidonMCPServer();
