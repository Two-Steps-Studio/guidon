import { config } from "./config.js";

export interface GuidonTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function call<T>(path: string, apiKey: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(`${config.guidonApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, error: body?.error ?? `Guidon API returned ${response.status}`, status: response.status };
  }
  return { ok: true, data: body as T };
}

/**
 * Also doubles as "is this key valid for this project" - api_keys aren't
 * project-scoped themselves (they authenticate a user, who may or may not
 * be a member of the project /guidon link names), so this is the actual
 * check: a 200 here means both the key is real and its owning user can see
 * this project. Used by the link command before it stores anything.
 */
export function listTasks(apiKey: string, projectId: string) {
  return call<{ tasks: GuidonTask[] }>(`/api/v1/projects/${projectId}/tasks`, apiKey);
}

export function startTask(apiKey: string, taskId: string) {
  return call<{ task: GuidonTask }>(`/api/v1/tasks/${taskId}/start`, apiKey, { method: "POST" });
}

export function completeTask(apiKey: string, taskId: string) {
  return call<{ task: GuidonTask }>(`/api/v1/tasks/${taskId}/complete`, apiKey, { method: "POST" });
}

export function commentOnTask(apiKey: string, taskId: string, content: string) {
  return call<{ comment: unknown }>(`/api/v1/tasks/${taskId}/comment`, apiKey, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}
