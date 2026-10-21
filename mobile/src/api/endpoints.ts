import { apiRequest } from "./client";
import type {
  Column,
  Comment,
  CreateTaskInput,
  DeletionPlan,
  MobileTokenResponse,
  Priority,
  Project,
  Task,
  TaskStatus,
  UpdateTaskInput,
} from "./types";

/**
 * Typed wrappers around the /api/v1 routes the app uses. Paths, bodies and
 * the `{ key: value }` envelopes match the route handlers exactly.
 * Scopes of the mobile key (MOBILE_KEY_SCOPES on the server): tasks:read,
 * tasks:write, tasks:status, comments:write, project:read, project:write.
 */

const id = (value: string) => encodeURIComponent(value);

export const api = {
  /** POST /api/v1/auth/mobile/token - no key yet; the code + PKCE verifier are the credentials. */
  exchangeMobileCode(server: string, code: string, codeVerifier: string): Promise<MobileTokenResponse> {
    return apiRequest<MobileTokenResponse>("/api/v1/auth/mobile/token", {
      method: "POST",
      body: { code, code_verifier: codeVerifier },
      anonymous: true,
      server,
    });
  },

  /** GET /api/v1/projects (tasks:read) */
  async listProjects(): Promise<Project[]> {
    return (await apiRequest<{ projects: Project[] }>("/api/v1/projects")).projects;
  },

  /** GET /api/v1/projects/{projectId}/columns (tasks:read) */
  async listColumns(projectId: string): Promise<Column[]> {
    return (await apiRequest<{ columns: Column[] }>(`/api/v1/projects/${id(projectId)}/columns`)).columns;
  },

  /** GET /api/v1/projects/{projectId}/priorities (tasks:read) */
  async listPriorities(projectId: string): Promise<Priority[]> {
    return (await apiRequest<{ priorities: Priority[] }>(`/api/v1/projects/${id(projectId)}/priorities`)).priorities;
  },

  /** GET /api/v1/projects/{projectId}/tasks (tasks:read) - capped at 1000, newest first, subtasks included. */
  async listTasks(projectId: string): Promise<Task[]> {
    return (await apiRequest<{ tasks: Task[] }>(`/api/v1/projects/${id(projectId)}/tasks`)).tasks;
  },

  /** POST /api/v1/projects/{projectId}/tasks (tasks:write) */
  async createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
    return (
      await apiRequest<{ task: Task }>(`/api/v1/projects/${id(projectId)}/tasks`, { method: "POST", body: input })
    ).task;
  },

  /** GET /api/v1/tasks/{taskId} (tasks:read) */
  async getTask(taskId: string): Promise<Task> {
    return (await apiRequest<{ task: Task }>(`/api/v1/tasks/${id(taskId)}`)).task;
  },

  /** PATCH /api/v1/tasks/{taskId} (tasks:write) - title/description/priority/due_date/sort_order only. */
  async updateTask(taskId: string, patch: UpdateTaskInput): Promise<Task> {
    return (await apiRequest<{ task: Task }>(`/api/v1/tasks/${id(taskId)}`, { method: "PATCH", body: patch })).task;
  },

  /** PATCH /api/v1/tasks/{taskId}/status (tasks:status) - any of the project's column keys. */
  async setTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return (
      await apiRequest<{ task: Task }>(`/api/v1/tasks/${id(taskId)}/status`, { method: "PATCH", body: { status } })
    ).task;
  },

  /** GET /api/v1/tasks/{taskId}/comment (tasks:read) - oldest first. */
  async listComments(taskId: string): Promise<Comment[]> {
    return (await apiRequest<{ comments: Comment[] }>(`/api/v1/tasks/${id(taskId)}/comment`)).comments;
  },

  /** POST /api/v1/tasks/{taskId}/comment (comments:write) */
  async addComment(taskId: string, content: string): Promise<Comment> {
    return (
      await apiRequest<{ comment: Comment }>(`/api/v1/tasks/${id(taskId)}/comment`, {
        method: "POST",
        body: { content },
      })
    ).comment;
  },

  /** GET /api/v1/account - what deleting the account would do (only the app's own key may ask). */
  async getDeletionPlan(): Promise<DeletionPlan> {
    return (await apiRequest<{ plan: DeletionPlan }>("/api/v1/account")).plan;
  },

  /** DELETE /api/v1/account - deletes the account for good; the email is the confirmation. */
  deleteAccount(confirmEmail: string): Promise<{ deleted: true; deleted_organizations: number }> {
    return apiRequest("/api/v1/account", { method: "DELETE", body: { confirm_email: confirmEmail } });
  },
};
