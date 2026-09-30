import { Column, Comment, DEFAULT_COLUMNS, Project, Reference, STATUSES, STATUS_LABELS, Task } from "./model";

/** Moodboard images above this are skipped rather than held in memory as data: URIs. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Thin client for Guidon's /api/v1 - the same calls as the other editor
 * plugins, over Node's built-in fetch (VS Code 1.85+ runs Node 18+). Never
 * throws: every failure comes back as { ok: false, error }.
 */
export class GuidonApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly apiKey: string) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, "");
  }

  listProjects(): Promise<Result<Project[]>> {
    return this.field("GET", "/api/v1/projects", "projects", []);
  }

  listTasks(projectId: string): Promise<Result<Task[]>> {
    return this.field("GET", `/api/v1/projects/${projectId}/tasks`, "tasks", []);
  }

  /** The project's visible columns; unknown statuses dropped, empty -> the defaults. */
  async listColumns(projectId: string): Promise<Result<Column[]>> {
    const result = await this.field<Array<{ status?: unknown; label?: unknown }>>("GET", `/api/v1/projects/${projectId}/columns`, "columns", []);
    if (!result.ok) return result;
    const seen = new Set<string>();
    const columns: Column[] = [];
    for (const column of result.value) {
      const status = typeof column?.status === "string" ? column.status : "";
      if (!(STATUSES as readonly string[]).includes(status) || seen.has(status)) continue;
      seen.add(status);
      columns.push({ status, label: typeof column.label === "string" && column.label ? column.label : STATUS_LABELS[status] });
    }
    return { ok: true, value: columns.length ? columns : DEFAULT_COLUMNS };
  }

  listReferences(projectId: string): Promise<Result<Reference[]>> {
    return this.field("GET", `/api/v1/projects/${projectId}/references`, "references", []);
  }

  /**
   * Downloads a moodboard image as a data: URI for the webview, which has no
   * network access of its own (see moodboard.ts's CSP). The URL is already
   * signed, so no API key is sent with it.
   */
  async fetchImage(url: string): Promise<Result<string>> {
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Unsupported image URL." };
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "GuidonTasks-VSCode/1.0" } });
      if (!response.ok) return { ok: false, error: `${response.status}` };
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!type.startsWith("image/") || type === "image/svg+xml") return { ok: false, error: "Not a raster image." };
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > MAX_IMAGE_BYTES) return { ok: false, error: "Image too large." };
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "Image too large." };
      return { ok: true, value: `data:${type};base64,${bytes.toString("base64")}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  createTask(projectId: string, fields: { title: string; status?: string; parent_task_id?: string }): Promise<Result<Task>> {
    return this.field("POST", `/api/v1/projects/${projectId}/tasks`, "task", null, fields);
  }

  updateTask(taskId: string, fields: Partial<Pick<Task, "title" | "description" | "priority" | "due_date" | "sort_order">>): Promise<Result<Task>> {
    return this.field("PATCH", `/api/v1/tasks/${taskId}`, "task", null, fields);
  }

  setStatus(taskId: string, status: string): Promise<Result<Task>> {
    return this.field("PATCH", `/api/v1/tasks/${taskId}/status`, "task", null, { status });
  }

  async deleteTask(taskId: string): Promise<Result<true>> {
    const result = await this.send("DELETE", `/api/v1/tasks/${taskId}`);
    return result.ok ? { ok: true, value: true } : result;
  }

  listComments(taskId: string): Promise<Result<Comment[]>> {
    return this.field("GET", `/api/v1/tasks/${taskId}/comment`, "comments", []);
  }

  addComment(taskId: string, content: string): Promise<Result<Comment>> {
    return this.field("POST", `/api/v1/tasks/${taskId}/comment`, "comment", null, { content });
  }

  private async field<T>(method: string, path: string, key: string, fallback: unknown, body?: unknown): Promise<Result<T>> {
    const result = await this.send(method, path, body);
    if (!result.ok) return result;
    const value = result.value[key] ?? fallback;
    if (value === null || value === undefined) return { ok: false, error: `Unexpected response: no "${key}".` };
    return { ok: true, value: value as T };
  }

  private async send(method: string, path: string, body?: unknown): Promise<Result<Record<string, unknown>>> {
    if (!this.baseUrl || !this.apiKey) return { ok: false, error: "Log in first." };
    let response: Response;
    try {
      response = await fetch(this.baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "User-Agent": "GuidonTasks-VSCode/1.0",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const reason = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
      return { ok: false, error: `Request failed: ${reason}` };
    }
    const text = await response.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = null;
    }
    if (!response.ok) {
      const serverError = json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : "";
      return { ok: false, error: `${response.status} ${serverError}`.trim() };
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, error: "Malformed response from the Guidon server." };
    return { ok: true, value: json as Record<string, unknown> };
  }
}
