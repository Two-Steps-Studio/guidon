import { HttpClient, type GuidonOptions, type HttpMethod, type RawRequest, type RequestOptions, type WriteOptions } from "./http.js";
import type {
  Attempt,
  Column,
  Comment,
  CreateSubtaskInput,
  CreateTaskInput,
  Decision,
  DecisionInput,
  DecisionPatch,
  FileReportInput,
  FileReportResult,
  KnowledgeSource,
  KnowledgeSourceInput,
  KnowledgeSourcePatch,
  MemoryEntry,
  MemoryInput,
  MemoryPatch,
  Priority,
  Project,
  RecordAttemptInput,
  Reference,
  RoadmapPhase,
  RoadmapPhaseInput,
  RoadmapPhasePatch,
  Task,
  TaskStatus,
  Technology,
  TechnologyInput,
  TechnologyPatch,
  UpdateTaskInput,
} from "./types.js";

const seg = (id: string, name: string): string => {
  if (typeof id !== "string" || !id) throw new TypeError(`${name} must be a non-empty string`);
  return encodeURIComponent(id);
};

/** Projects the key's user belongs to, and their board configuration. */
export class ProjectsResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /projects - the projects the key's user is a member of. Scope `tasks:read`. */
  async list(options?: RequestOptions): Promise<Project[]> {
    const res = await this.http.request<{ projects: Project[] }>("GET", "/projects", options);
    return res.projects;
  }

  /** GET /projects/{id}/columns - visible board columns, in order. Scope `tasks:read`. */
  async columns(projectId: string, options?: RequestOptions): Promise<Column[]> {
    const res = await this.http.request<{ columns: Column[] }>("GET", `/projects/${seg(projectId, "projectId")}/columns`, options);
    return res.columns;
  }

  /** GET /projects/{id}/priorities - task priorities, most important first. Scope `tasks:read`. */
  async priorities(projectId: string, options?: RequestOptions): Promise<Priority[]> {
    const res = await this.http.request<{ priorities: Priority[] }>(
      "GET",
      `/projects/${seg(projectId, "projectId")}/priorities`,
      options
    );
    return res.priorities;
  }

  /** GET /projects/{id}/references - moodboard images with short-lived signed URLs. Scope `tasks:read`. */
  async references(projectId: string, options?: RequestOptions): Promise<Reference[]> {
    const res = await this.http.request<{ references: Reference[] }>(
      "GET",
      `/projects/${seg(projectId, "projectId")}/references`,
      options
    );
    return res.references;
  }
}

export interface ListTasksFilter {
  /** Only tasks in these columns. */
  status?: TaskStatus | TaskStatus[];
  /** `null` for top-level tasks only, a task id for that task's subtasks. */
  parentTaskId?: string | null;
  /** Tasks per request while paging (server default and maximum: 1000). */
  pageSize?: number;
}

export interface PageOptions {
  /** Page size, 1-1000 (server default 1000). */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string;
}

export interface TaskPage {
  tasks: Task[];
  /** Pass as `cursor` to get the next page; `null` on the last page. */
  nextCursor: string | null;
}

/** Board cards. */
export class TasksResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * GET /projects/{id}/tasks - one page of the project's tasks, newest first.
   * Scope `tasks:read`.
   */
  async listPage(projectId: string, page: PageOptions = {}, options?: RequestOptions): Promise<TaskPage> {
    const res = await this.http.request<{ tasks: Task[]; next_cursor?: string | null }>(
      "GET",
      `/projects/${seg(projectId, "projectId")}/tasks`,
      { ...options, query: { limit: page.limit, cursor: page.cursor } }
    );
    return { tasks: res.tasks ?? [], nextCursor: res.next_cursor ?? null };
  }

  /**
   * Every task of the project, newest first, fetched page by page as you
   * iterate. Scope `tasks:read`.
   *
   * ```ts
   * for await (const task of guidon.tasks.iterate(projectId)) console.log(task.title);
   * ```
   */
  async *iterate(projectId: string, page: { pageSize?: number } = {}, options?: RequestOptions): AsyncGenerator<Task, void, undefined> {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      const res = await this.listPage(projectId, { limit: page.pageSize, cursor }, options);
      yield* res.tasks;
      if (!res.nextCursor || seen.has(res.nextCursor)) return;
      seen.add(res.nextCursor);
      cursor = res.nextCursor;
    }
  }

  /**
   * All of the project's tasks (every page), newest first. Scope `tasks:read`.
   * `status` and `parentTaskId` are applied client-side - the API has no
   * server-side filters yet.
   */
  async list(projectId: string, filter: ListTasksFilter = {}, options?: RequestOptions): Promise<Task[]> {
    let tasks: Task[] = [];
    for await (const task of this.iterate(projectId, { pageSize: filter.pageSize }, options)) tasks.push(task);
    if (filter.status !== undefined) {
      const wanted = new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
      tasks = tasks.filter((t) => wanted.has(t.status));
    }
    if (filter.parentTaskId !== undefined) {
      tasks = tasks.filter((t) => (t.parent_task_id ?? null) === filter.parentTaskId);
    }
    return tasks;
  }

  /** GET /tasks/{id}. Scope `tasks:read`. */
  async get(taskId: string, options?: RequestOptions): Promise<Task> {
    const res = await this.http.request<{ task: Task }>("GET", `/tasks/${seg(taskId, "taskId")}`, options);
    return res.task;
  }

  /**
   * POST /projects/{id}/tasks - a top-level task (defaults `backlog`/`medium`),
   * or a subtask when `parent_task_id` is set. Scope `tasks:write`.
   */
  async create(projectId: string, input: CreateTaskInput, options?: WriteOptions): Promise<Task> {
    const res = await this.http.request<{ task: Task }>("POST", `/projects/${seg(projectId, "projectId")}/tasks`, {
      ...options,
      body: input,
    });
    return res.task;
  }

  /** PATCH /tasks/{id} - edit fields (not the status: use `move`). Scope `tasks:write`. */
  async update(taskId: string, patch: UpdateTaskInput, options?: WriteOptions): Promise<Task> {
    const res = await this.http.request<{ task: Task }>("PATCH", `/tasks/${seg(taskId, "taskId")}`, { ...options, body: patch });
    return res.task;
  }

  /** PATCH /tasks/{id}/status - move the task to another column. Scope `tasks:status`. */
  async move(taskId: string, status: TaskStatus, options?: WriteOptions): Promise<Task> {
    const res = await this.http.request<{ task: Task }>("PATCH", `/tasks/${seg(taskId, "taskId")}/status`, {
      ...options,
      body: { status },
    });
    return res.task;
  }

  /** DELETE /tasks/{id} - permanent (project owner/admin). Scope `tasks:write`. */
  async delete(taskId: string, options?: WriteOptions): Promise<void> {
    await this.http.request<{ ok: true }>("DELETE", `/tasks/${seg(taskId, "taskId")}`, options);
  }

  /** POST /tasks/{id}/start - claim the task (in progress / AI working). Scope `tasks:status`. */
  async start(taskId: string, options?: WriteOptions): Promise<Task> {
    const res = await this.http.request<{ task: Task }>("POST", `/tasks/${seg(taskId, "taskId")}/start`, options);
    return res.task;
  }

  /** POST /tasks/{id}/complete - mark done, if the project allows AI auto-complete. Scope `tasks:status`. */
  async complete(taskId: string, options?: WriteOptions): Promise<Task> {
    const res = await this.http.request<{ task: Task }>("POST", `/tasks/${seg(taskId, "taskId")}/complete`, options);
    return res.task;
  }

  /** GET /tasks/{id}/context - everything needed to do the task, as Markdown. Scope `tasks:read`. */
  async context(taskId: string, options?: RequestOptions): Promise<string> {
    return this.http.request<string>("GET", `/tasks/${seg(taskId, "taskId")}/context`, { ...options, responseType: "text" });
  }
}

/**
 * Subtasks are tasks with `parent_task_id` set; they go through the same
 * routes. A subtask always starts as `todo`/`medium`.
 */
export class SubtasksResource {
  constructor(private readonly tasks: TasksResource) {}

  /** The subtasks of `parentTaskId` (fetches the project's task list). */
  list(projectId: string, parentTaskId: string, options?: RequestOptions): Promise<Task[]> {
    seg(parentTaskId, "parentTaskId");
    return this.tasks.list(projectId, { parentTaskId }, options);
  }

  create(projectId: string, parentTaskId: string, input: CreateSubtaskInput, options?: WriteOptions): Promise<Task> {
    seg(parentTaskId, "parentTaskId");
    return this.tasks.create(projectId, { ...input, parent_task_id: parentTaskId }, options);
  }
}

export class CommentsResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /tasks/{id}/comment. Scope `tasks:read`. */
  async list(taskId: string, options?: RequestOptions): Promise<Comment[]> {
    const res = await this.http.request<{ comments: Comment[] }>("GET", `/tasks/${seg(taskId, "taskId")}/comment`, options);
    return res.comments;
  }

  /** POST /tasks/{id}/comment. Scope `comments:write`. */
  async create(taskId: string, content: string, options?: WriteOptions): Promise<Comment> {
    const res = await this.http.request<{ comment: Comment }>("POST", `/tasks/${seg(taskId, "taskId")}/comment`, {
      ...options,
      body: { content },
    });
    return res.comment;
  }
}

export class AttemptsResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /tasks/{id}/attempts - newest first. Scope `tasks:read`. */
  async list(taskId: string, options?: RequestOptions): Promise<Attempt[]> {
    const res = await this.http.request<{ attempts: Attempt[] }>("GET", `/tasks/${seg(taskId, "taskId")}/attempts`, options);
    return res.attempts;
  }

  /** POST /tasks/{id}/attempts - record what was tried, including failures. Scope `attempts:write`. */
  async record(taskId: string, input: RecordAttemptInput, options?: WriteOptions): Promise<Attempt> {
    const res = await this.http.request<{ attempt: Attempt }>("POST", `/tasks/${seg(taskId, "taskId")}/attempts`, {
      ...options,
      body: input,
    });
    return res.attempt;
  }
}

export class ReportsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * POST /projects/{id}/reports (multipart) - file a bug report; creates a
   * Backlog task with the files attached. Scope `reports:write`, which a key
   * can't combine with any other scope.
   */
  async file(projectId: string, input: FileReportInput, options?: WriteOptions): Promise<FileReportResult> {
    const form = new FormData();
    form.set("title", input.title);
    if (input.description !== undefined) form.set("description", input.description);
    if (input.category !== undefined) form.set("category", input.category);
    if (input.source !== undefined) form.set("source", input.source);
    if (input.reporter !== undefined) form.set("reporter", input.reporter);
    if (input.metadata !== undefined) form.set("metadata", JSON.stringify(input.metadata));
    for (const file of input.files ?? []) {
      const blob =
        file.data instanceof Blob
          ? file.data
          : new Blob([file.data as BlobPart], file.type ? { type: file.type } : undefined);
      form.append("file", blob, file.name);
    }
    return this.http.request<FileReportResult>("POST", `/projects/${seg(projectId, "projectId")}/reports`, {
      ...options,
      body: form,
    });
  }
}

/**
 * The project modules around the board (decisions, knowledge, roadmap,
 * memory, tech stack): one shape, /projects/{projectId}/<path>[/{itemId}].
 * Reads need `project:read`, writes `project:write`.
 */
export class ProjectCollection<Item, CreateInput, Patch> {
  constructor(
    private readonly http: HttpClient,
    private readonly path: string,
    private readonly listKey: string,
    private readonly itemKey: string
  ) {}

  #base(projectId: string) {
    return `/projects/${seg(projectId, "projectId")}/${this.path}`;
  }

  async #call<T>(method: HttpMethod, path: string, key: string, req?: RawRequest): Promise<T> {
    const res = await this.http.request<Record<string, T>>(method, path, req);
    return res[key] as T;
  }

  /** Up to 500 items. */
  list(projectId: string, options?: RequestOptions): Promise<Item[]> {
    return this.#call<Item[]>("GET", this.#base(projectId), this.listKey, options);
  }

  get(projectId: string, itemId: string, options?: RequestOptions): Promise<Item> {
    return this.#call<Item>("GET", `${this.#base(projectId)}/${seg(itemId, "itemId")}`, this.itemKey, options);
  }

  create(projectId: string, input: CreateInput, options?: WriteOptions): Promise<Item> {
    return this.#call<Item>("POST", this.#base(projectId), this.itemKey, { ...options, body: input });
  }

  update(projectId: string, itemId: string, patch: Patch, options?: WriteOptions): Promise<Item> {
    return this.#call<Item>("PATCH", `${this.#base(projectId)}/${seg(itemId, "itemId")}`, this.itemKey, {
      ...options,
      body: patch,
    });
  }

  async delete(projectId: string, itemId: string, options?: WriteOptions): Promise<void> {
    await this.http.request("DELETE", `${this.#base(projectId)}/${seg(itemId, "itemId")}`, options);
  }
}

/**
 * Client for the Guidon REST API (/api/v1).
 *
 * ```ts
 * const guidon = new Guidon({ apiKey: process.env.GUIDON_API_KEY });
 * const [project] = await guidon.projects.list();
 * const task = await guidon.tasks.create(project.id, { title: "Fix the jump" });
 * await guidon.tasks.move(task.id, "in_progress");
 * ```
 */
export class Guidon {
  readonly projects: ProjectsResource;
  readonly tasks: TasksResource;
  readonly subtasks: SubtasksResource;
  readonly comments: CommentsResource;
  readonly attempts: AttemptsResource;
  readonly reports: ReportsResource;
  readonly decisions: ProjectCollection<Decision, DecisionInput, DecisionPatch>;
  readonly knowledge: ProjectCollection<KnowledgeSource, KnowledgeSourceInput, KnowledgeSourcePatch>;
  readonly roadmap: ProjectCollection<RoadmapPhase, RoadmapPhaseInput, RoadmapPhasePatch>;
  readonly memory: ProjectCollection<MemoryEntry, MemoryInput, MemoryPatch>;
  readonly technologies: ProjectCollection<Technology, TechnologyInput, TechnologyPatch>;
  readonly #http: HttpClient;

  constructor(options: GuidonOptions = {}) {
    const http = new HttpClient(options);
    this.#http = http;
    this.projects = new ProjectsResource(http);
    this.tasks = new TasksResource(http);
    this.subtasks = new SubtasksResource(this.tasks);
    this.comments = new CommentsResource(http);
    this.attempts = new AttemptsResource(http);
    this.reports = new ReportsResource(http);
    this.decisions = new ProjectCollection(http, "decisions", "decisions", "decision");
    this.knowledge = new ProjectCollection(http, "knowledge", "sources", "source");
    this.roadmap = new ProjectCollection(http, "roadmap", "phases", "phase");
    this.memory = new ProjectCollection(http, "memory", "memories", "memory");
    this.technologies = new ProjectCollection(http, "technologies", "technologies", "technology");
  }

  /** The resolved API root, e.g. `https://useguidon.com/api/v1`. */
  get baseUrl(): string {
    return this.#http.baseUrl;
  }

  /**
   * Escape hatch for routes this SDK doesn't wrap yet. `path` is relative to
   * /api/v1, e.g. `/projects`.
   */
  request<T = unknown>(method: HttpMethod, path: string, request?: RawRequest): Promise<T> {
    return this.#http.request<T>(method, path, request);
  }
}
