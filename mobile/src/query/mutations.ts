import type { QueryClient } from "@tanstack/react-query";
import { api, isApiError, type Comment, type CreateTaskInput, type Task, type UpdateTaskInput } from "@/api";
import { emitSelfUserId, getKnownSelfUserId } from "@/auth/events";
import { t } from "@/i18n";
import { apiDayToIso } from "@/lib/dates";
import { haptics } from "@/lib/haptics";
import { showToast } from "@/lib/toast";
import { mutationKeys, queryKeys, WRITE_SCOPE } from "./keys";

/**
 * Every write the app makes, with its optimistic update and rollback. They
 * live here as mutation *defaults* (not inline in components) so a change
 * that was paused offline and persisted can run after an app restart: the
 * restored mutation only knows its key and variables, and finds its
 * mutationFn here. Variables are plain JSON for the same reason.
 */

export type SetStatusVars = { projectId: string; taskId: string; status: string; isDone: boolean };
export type UpdateTaskVars = { projectId: string; taskId: string; patch: UpdateTaskInput };
export type CreateTaskVars = {
  projectId: string;
  tempId: string;
  input: CreateTaskInput;
  /** Whether the target column counts as done - for the optimistic card. */
  isDone: boolean;
  createdAt: string;
};
export type AddCommentVars = { taskId: string; tempId: string; content: string; createdAt: string };

type TaskSnapshot = { previous: Task | undefined };

function findTask(qc: QueryClient, projectId: string, taskId: string): Task | undefined {
  return (
    qc.getQueryData<Task>(queryKeys.task(taskId)) ??
    qc.getQueryData<Task[]>(queryKeys.tasks(projectId))?.find((task) => task.id === taskId)
  );
}

function writeTask(qc: QueryClient, projectId: string, taskId: string, update: (task: Task) => Task): void {
  qc.setQueryData<Task[]>(queryKeys.tasks(projectId), (list) =>
    list?.map((task) => (task.id === taskId ? update(task) : task))
  );
  qc.setQueryData<Task>(queryKeys.task(taskId), (task) => (task ? update(task) : task));
}

function putTask(qc: QueryClient, task: Task): void {
  writeTask(qc, task.project_id, task.id, () => task);
}

/**
 * True when no other write is still queued: only then is the server's answer
 * (or a refetch) safe to show - otherwise it would briefly undo a later
 * optimistic change that hasn't reached the server yet.
 */
function isLastWrite(qc: QueryClient): boolean {
  return qc.isMutating() <= 1;
}

function reportFailure(error: unknown): void {
  if (isApiError(error) && error.isUnauthorized) return; // the session handles it
  haptics.error();
  const message = error instanceof Error ? error.message : String(error);
  showToast(t("errors.saveFailed", { message }));
}

function toCachedPatch(patch: UpdateTaskInput): Partial<Task> {
  const { due_date, ...rest } = patch;
  const cached: Partial<Task> = { ...rest };
  if (due_date !== undefined) cached.due_date = due_date ? apiDayToIso(due_date) : null;
  return cached;
}

export function registerMutationDefaults(qc: QueryClient): void {
  qc.setMutationDefaults<Task, unknown, SetStatusVars, TaskSnapshot>(mutationKeys.setStatus, {
    scope: WRITE_SCOPE,
    mutationFn: (vars: SetStatusVars) => api.setTaskStatus(vars.taskId, vars.status),
    onMutate: async (vars: SetStatusVars): Promise<TaskSnapshot> => {
      await qc.cancelQueries({ queryKey: queryKeys.tasks(vars.projectId) });
      await qc.cancelQueries({ queryKey: queryKeys.task(vars.taskId) });
      const previous = findTask(qc, vars.projectId, vars.taskId);
      writeTask(qc, vars.projectId, vars.taskId, (task) => ({ ...task, status: vars.status, is_done: vars.isDone }));
      if (vars.isDone && !previous?.is_done) haptics.success();
      else haptics.tap();
      return { previous };
    },
    onSuccess: (task: Task) => {
      if (isLastWrite(qc)) putTask(qc, task);
    },
    onError: (error: unknown, vars: SetStatusVars, context: TaskSnapshot | undefined) => {
      if (context?.previous) putTask(qc, context.previous);
      else void qc.invalidateQueries({ queryKey: queryKeys.tasks(vars.projectId) });
      reportFailure(error);
    },
    onSettled: (_data: unknown, _error: unknown, vars: SetStatusVars) => {
      if (!isLastWrite(qc)) return;
      void qc.invalidateQueries({ queryKey: queryKeys.tasks(vars.projectId) });
      void qc.invalidateQueries({ queryKey: queryKeys.task(vars.taskId), exact: true });
    },
  });

  qc.setMutationDefaults<Task, unknown, UpdateTaskVars, TaskSnapshot>(mutationKeys.updateTask, {
    scope: WRITE_SCOPE,
    mutationFn: (vars: UpdateTaskVars) => api.updateTask(vars.taskId, vars.patch),
    onMutate: async (vars: UpdateTaskVars): Promise<TaskSnapshot> => {
      await qc.cancelQueries({ queryKey: queryKeys.tasks(vars.projectId) });
      await qc.cancelQueries({ queryKey: queryKeys.task(vars.taskId) });
      const previous = findTask(qc, vars.projectId, vars.taskId);
      const cached = toCachedPatch(vars.patch);
      writeTask(qc, vars.projectId, vars.taskId, (task) => ({ ...task, ...cached }));
      haptics.tap();
      return { previous };
    },
    onSuccess: (task: Task) => {
      if (isLastWrite(qc)) putTask(qc, task);
    },
    onError: (error: unknown, vars: UpdateTaskVars, context: TaskSnapshot | undefined) => {
      if (context?.previous) putTask(qc, context.previous);
      else void qc.invalidateQueries({ queryKey: queryKeys.tasks(vars.projectId) });
      reportFailure(error);
    },
    onSettled: (_data: unknown, _error: unknown, vars: UpdateTaskVars) => {
      if (!isLastWrite(qc)) return;
      void qc.invalidateQueries({ queryKey: queryKeys.tasks(vars.projectId) });
      void qc.invalidateQueries({ queryKey: queryKeys.task(vars.taskId), exact: true });
    },
  });

  qc.setMutationDefaults<Task, unknown, CreateTaskVars, undefined>(mutationKeys.createTask, {
    scope: WRITE_SCOPE,
    mutationFn: (vars: CreateTaskVars) => api.createTask(vars.projectId, vars.input),
    onMutate: async (vars: CreateTaskVars) => {
      await qc.cancelQueries({ queryKey: queryKeys.tasks(vars.projectId) });
      const self = getKnownSelfUserId() ?? "";
      const optimistic: Task = {
        id: vars.tempId,
        project_id: vars.projectId,
        parent_task_id: vars.input.parent_task_id ?? null,
        title: vars.input.title,
        description: vars.input.description ?? null,
        status: vars.input.status ?? "backlog",
        priority: vars.input.priority ?? "medium",
        is_done: vars.isDone,
        tags: [],
        due_date: vars.input.due_date ? apiDayToIso(vars.input.due_date) : null,
        assignee_id: null,
        sort_order: null,
        created_by: self,
        created_at: vars.createdAt,
        updated_at: vars.createdAt,
      };
      qc.setQueryData<Task[]>(queryKeys.tasks(vars.projectId), (list) => [optimistic, ...(list ?? [])]);
      haptics.tap();
      return undefined;
    },
    onSuccess: (task: Task, vars: CreateTaskVars) => {
      qc.setQueryData<Task[]>(queryKeys.tasks(vars.projectId), (list) =>
        list?.map((item) => (item.id === vars.tempId ? task : item))
      );
      qc.setQueryData<Task>(queryKeys.task(task.id), task);
      emitSelfUserId(task.created_by);
    },
    onError: (error: unknown, vars: CreateTaskVars) => {
      qc.setQueryData<Task[]>(queryKeys.tasks(vars.projectId), (list) =>
        list?.filter((item) => item.id !== vars.tempId)
      );
      reportFailure(error);
    },
    onSettled: (_data: unknown, _error: unknown, vars: CreateTaskVars) => {
      if (isLastWrite(qc)) void qc.invalidateQueries({ queryKey: queryKeys.tasks(vars.projectId) });
    },
  });

  qc.setMutationDefaults<Comment, unknown, AddCommentVars, undefined>(mutationKeys.addComment, {
    scope: WRITE_SCOPE,
    mutationFn: (vars: AddCommentVars) => api.addComment(vars.taskId, vars.content),
    onMutate: async (vars: AddCommentVars) => {
      await qc.cancelQueries({ queryKey: queryKeys.comments(vars.taskId) });
      const optimistic: Comment = {
        id: vars.tempId,
        task_id: vars.taskId,
        author_id: getKnownSelfUserId() ?? "",
        content: vars.content,
        created_at: vars.createdAt,
        actor_label: null,
      };
      qc.setQueryData<Comment[]>(queryKeys.comments(vars.taskId), (list) => [...(list ?? []), optimistic]);
      haptics.tap();
      return undefined;
    },
    onSuccess: (comment: Comment, vars: AddCommentVars) => {
      qc.setQueryData<Comment[]>(queryKeys.comments(vars.taskId), (list) =>
        list?.map((item) => (item.id === vars.tempId ? comment : item))
      );
      emitSelfUserId(comment.author_id);
    },
    onError: (error: unknown, vars: AddCommentVars) => {
      qc.setQueryData<Comment[]>(queryKeys.comments(vars.taskId), (list) =>
        list?.filter((item) => item.id !== vars.tempId)
      );
      reportFailure(error);
    },
    onSettled: (_data: unknown, _error: unknown, vars: AddCommentVars) => {
      if (isLastWrite(qc)) void qc.invalidateQueries({ queryKey: queryKeys.comments(vars.taskId) });
    },
  });
}
