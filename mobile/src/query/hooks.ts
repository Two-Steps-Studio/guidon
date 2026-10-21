import { onlineManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api, type ApiError, type Comment, type Task } from "@/api";
import { mutationKeys, queryKeys } from "./keys";
import type { AddCommentVars, CreateTaskVars, SetStatusVars, UpdateTaskVars } from "./mutations";

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects(), queryFn: api.listProjects });
}

export function useColumns(projectId: string) {
  return useQuery({
    queryKey: queryKeys.columns(projectId),
    queryFn: () => api.listColumns(projectId),
    staleTime: 5 * 60_000,
    enabled: projectId.length > 0,
  });
}

export function usePriorities(projectId: string) {
  return useQuery({
    queryKey: queryKeys.priorities(projectId),
    queryFn: () => api.listPriorities(projectId),
    staleTime: 5 * 60_000,
    enabled: projectId.length > 0,
  });
}

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: () => api.listTasks(projectId),
    enabled: projectId.length > 0,
  });
}

/**
 * One task. Seeded from the project's task list already on the phone, so the
 * detail screen opens instantly (and offline) and refreshes in the background.
 */
export function useTask(taskId: string, projectId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.task(taskId),
    queryFn: () => api.getTask(taskId),
    initialData: () =>
      projectId ? qc.getQueryData<Task[]>(queryKeys.tasks(projectId))?.find((task) => task.id === taskId) : undefined,
    initialDataUpdatedAt: () => (projectId ? qc.getQueryState(queryKeys.tasks(projectId))?.dataUpdatedAt : undefined),
  });
}

export function useComments(taskId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.comments(taskId),
    queryFn: () => api.listComments(taskId),
    enabled,
  });
}

// Mutations: options come from the defaults registered in mutations.ts.

export function useSetStatus() {
  return useMutation<Task, ApiError, SetStatusVars>({ mutationKey: mutationKeys.setStatus });
}

export function useUpdateTask() {
  return useMutation<Task, ApiError, UpdateTaskVars>({ mutationKey: mutationKeys.updateTask });
}

export function useCreateTask() {
  return useMutation<Task, ApiError, CreateTaskVars>({ mutationKey: mutationKeys.createTask });
}

export function useAddComment() {
  return useMutation<Comment, ApiError, AddCommentVars>({ mutationKey: mutationKeys.addComment });
}

/** React Query's online state (fed by NetInfo, see client.ts). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true
  );
}
