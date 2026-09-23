import { GuidonApi } from "./api";
import { appendSortOrder, Column, columnTasks, Comment, DEFAULT_COLUMNS, isValidDueDate, Project, Task } from "./model";

/** Everything the board shows - posted to the webview as-is after each change. */
export interface BoardState {
  loggedIn: boolean;
  email: string;
  baseUrl: string;
  loggingIn: boolean;
  busy: boolean;
  error: string;
  projects: Project[];
  projectId: string;
  columns: Column[];
  tasks: Task[];
  selectedTaskId: string;
  comments: Record<string, Comment[]>;
}

export interface StoreHost {
  api(): GuidonApi | null;
  getProjectId(): string;
  setProjectId(id: string): void;
  account(): { loggedIn: boolean; email: string; baseUrl: string };
}

/**
 * The board's state and actions, shared by the webview, the status bar and
 * the Git commands. No vscode import: the extension wires it to SecretStorage
 * and settings, the tests to a real local Guidon.
 */
export class BoardStore {
  projects: Project[] = [];
  tasks: Task[] = [];
  columns: Column[] = DEFAULT_COLUMNS;
  comments: Record<string, Comment[]> = {};
  selectedTaskId = "";
  error = "";
  loggingIn = false;
  private pending = 0;
  private listeners = new Set<() => void>();

  constructor(private readonly host: StoreHost) {}

  get projectId(): string {
    return this.host.getProjectId();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  state(): BoardState {
    const account = this.host.account();
    return {
      ...account,
      loggingIn: this.loggingIn,
      busy: this.pending > 0,
      error: this.error,
      projects: this.projects,
      projectId: this.projectId,
      columns: this.columns,
      tasks: this.tasks,
      selectedTaskId: this.selectedTaskId,
      comments: this.comments,
    };
  }

  emit(): void {
    for (const listener of this.listeners) listener();
  }

  setError(message: string): void {
    this.error = message;
    this.emit();
  }

  reset(): void {
    this.projects = [];
    this.tasks = [];
    this.columns = DEFAULT_COLUMNS;
    this.comments = {};
    this.selectedTaskId = "";
    this.error = "";
    this.emit();
  }

  findTask(id: string): Task | undefined {
    return this.tasks.find((task) => task.id === id);
  }

  private async run<T>(work: (api: GuidonApi) => Promise<T>): Promise<T | null> {
    const api = this.host.api();
    if (!api) {
      this.setError("Log in first.");
      return null;
    }
    this.pending++;
    this.emit();
    try {
      return await work(api);
    } finally {
      this.pending--;
      this.emit();
    }
  }

  private replace(task: Task): void {
    const index = this.tasks.findIndex((t) => t.id === task.id);
    if (index >= 0) this.tasks[index] = task;
    else this.tasks.push(task);
  }

  async refresh(): Promise<void> {
    await this.run(async (api) => {
      const result = await api.listProjects();
      if (!result.ok) return this.setError(result.error);
      this.error = "";
      this.projects = result.value;
      if (!this.projects.some((p) => p.id === this.projectId)) this.host.setProjectId(this.projects[0]?.id ?? "");
    });
    await this.loadTasks();
  }

  async selectProject(projectId: string): Promise<void> {
    if (projectId === this.projectId) return;
    this.host.setProjectId(projectId);
    this.tasks = [];
    this.columns = DEFAULT_COLUMNS;
    this.comments = {};
    this.selectedTaskId = "";
    this.emit();
    await this.loadTasks();
  }

  async loadTasks(): Promise<void> {
    const projectId = this.projectId;
    if (!projectId) {
      this.tasks = [];
      return this.emit();
    }
    await this.run(async (api) => {
      const [tasks, columns] = await Promise.all([api.listTasks(projectId), api.listColumns(projectId)]);
      if (projectId !== this.projectId) return; // switched project meanwhile
      if (!tasks.ok) return this.setError(tasks.error);
      this.tasks = tasks.value;
      // A columns failure (e.g. an older server without the endpoint) just means the defaults.
      this.columns = columns.ok ? columns.value : DEFAULT_COLUMNS;
      if (!this.findTask(this.selectedTaskId)) this.selectedTaskId = "";
    });
    if (this.selectedTaskId) await this.loadComments(this.selectedTaskId);
  }

  async select(taskId: string): Promise<void> {
    if (!this.findTask(taskId)) return;
    this.selectedTaskId = taskId;
    this.emit();
    await this.loadComments(taskId);
  }

  async loadComments(taskId: string): Promise<void> {
    await this.run(async (api) => {
      const result = await api.listComments(taskId);
      if (!result.ok) return this.setError(result.error);
      this.comments = { ...this.comments, [taskId]: result.value };
    });
  }

  /** Optimistic, like the other plugins: move now, revert if refused. A moved top-level card lands at the end of its column. */
  async move(taskId: string, status: string): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task || task.status === status) return false;
    const previous = { ...task };
    const reorder = !task.parent_task_id;
    const sortOrder = reorder ? appendSortOrder(columnTasks(this.tasks, status)) : task.sort_order;
    this.replace({ ...task, status, sort_order: sortOrder });
    this.emit();
    const ok = await this.run(async (api) => {
      const moved = await api.setStatus(taskId, status);
      if (!moved.ok) {
        this.replace(previous);
        this.setError(moved.error);
        return false;
      }
      this.replace(moved.value);
      if (reorder && sortOrder !== null) {
        const sorted = await api.updateTask(taskId, { sort_order: sortOrder });
        if (sorted.ok) this.replace(sorted.value);
        else this.setError(sorted.error); // the status change landed - only the position didn't
      }
      return true;
    });
    return ok === true;
  }

  async create(title: string, status: string, parentId = ""): Promise<Task | null> {
    const projectId = this.projectId;
    return this.run(async (api) => {
      const result = await api.createTask(projectId, { title, ...(parentId ? { parent_task_id: parentId } : { status }) });
      if (!result.ok) {
        this.setError(result.error);
        return null;
      }
      this.error = "";
      if (projectId === this.projectId) this.replace(result.value);
      return result.value;
    });
  }

  async save(taskId: string, fields: { title: string; description: string; priority: string; due_date: string }): Promise<boolean> {
    const title = fields.title.trim();
    if (!title) {
      this.setError("Title is required.");
      return false;
    }
    if (!isValidDueDate(fields.due_date)) {
      this.setError("Due date must be YYYY-MM-DD (or empty).");
      return false;
    }
    const ok = await this.run(async (api) => {
      const result = await api.updateTask(taskId, { ...fields, title });
      if (!result.ok) {
        this.setError(result.error);
        return false;
      }
      this.error = "";
      this.replace(result.value);
      return true;
    });
    return ok === true;
  }

  async remove(taskId: string): Promise<boolean> {
    const ok = await this.run(async (api) => {
      const result = await api.deleteTask(taskId);
      if (!result.ok) {
        this.setError(result.error);
        return false;
      }
      // Subtasks go with their parent (ON DELETE CASCADE, migration 010).
      this.tasks = this.tasks.filter((t) => t.id !== taskId && t.parent_task_id !== taskId);
      if (this.selectedTaskId === taskId) this.selectedTaskId = "";
      return true;
    });
    return ok === true;
  }

  async comment(taskId: string, content: string): Promise<boolean> {
    const text = content.trim();
    if (!text) return false;
    const ok = await this.run(async (api) => {
      const result = await api.addComment(taskId, text);
      if (!result.ok) {
        this.setError(result.error);
        return false;
      }
      this.comments = { ...this.comments, [taskId]: [...(this.comments[taskId] ?? []), result.value] };
      return true;
    });
    return ok === true;
  }
}
