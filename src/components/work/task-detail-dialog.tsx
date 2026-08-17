"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BOARD_COLUMNS,
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  normalizeTaskPriority,
  normalizeTaskStatus,
} from "@/lib/work/task-board";
import { initialsFor, type TaskCardMember } from "@/components/work/task-card";
import type { Task, TaskPriority, TaskStatus, UpdateTaskData } from "@/types/task";

interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

interface TaskDetailDialogProps {
  task: Task | null;
  members: TaskCardMember[];
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  currentUserId: string | null;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}

interface TaskForm {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string;
  due_date: string;
  tags: string;
}

function formToTask(task: Task): TaskForm {
  return {
    title: task.title,
    description: task.description ?? "",
    status: normalizeTaskStatus(task.status),
    priority: normalizeTaskPriority(task.priority),
    assignee_id: task.assignee_id ?? "",
    due_date: task.due_date ? task.due_date.slice(0, 10) : "",
    tags: (task.tags ?? []).join(", "),
  };
}

export function TaskDetailDialog({
  task,
  members,
  canEdit,
  canDelete,
  canComment,
  currentUserId,
  onClose,
  onSaved,
  onDeleted,
}: TaskDetailDialogProps) {
  // Derived from `task` at mount rather than synced via an effect; the parent
  // keys this component by task id, so opening a different task remounts it
  // and re-runs these initialisers.
  const [form, setForm] = useState<TaskForm | null>(() =>
    task ? formToTask(task) : null
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const membersById = new Map(members.map((member) => [member.id, member]));

  const loadComments = useCallback(async (taskId: string) => {
    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("task_comments")
        .select("id, task_id, author_id, content, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      setComments(data ?? []);
    } catch (err) {
      setCommentsError(
        err instanceof Error ? err.message : "Failed to load comments"
      );
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const taskId = task?.id;

  // Comments are fetched for the task this dialog was mounted for; all state
  // updates inside loadComments happen after an await.
  useEffect(() => {
    if (!taskId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadComments(taskId);
  }, [taskId, loadComments]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !form) return;

    setSaving(true);
    setError(null);

    try {
      const patch: Omit<UpdateTaskData, "id"> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        assignee_id: form.assignee_id || undefined,
        due_date: form.due_date
          ? new Date(form.due_date).toISOString()
          : undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };

      const supabase = createClient();
      const { data, error: updateError } = await supabase
        .from("tasks")
        .update({
          ...patch,
          // Explicit nulls: an empty field means "clear", not "leave alone".
          description: form.description.trim() || null,
          assignee_id: form.assignee_id || null,
          due_date: form.due_date
            ? new Date(form.due_date).toISOString()
            : null,
        })
        .eq("id", task.id)
        .select()
        .single();

      if (updateError) throw updateError;

      onSaved(data as Task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;

    setDeleting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("tasks")
        .delete()
        .eq("id", task.id);

      if (deleteError) throw deleteError;

      onDeleted(task.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  const handleComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !draft.trim() || !currentUserId) return;

    setPosting(true);
    setCommentsError(null);

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("task_comments")
        .insert({
          task_id: task.id,
          author_id: currentUserId,
          content: draft.trim(),
        })
        .select("id, task_id, author_id, content, created_at")
        .single();

      if (insertError) throw insertError;

      setComments((current) => [...current, data as TaskComment]);
      setDraft("");
    } catch (err) {
      setCommentsError(
        err instanceof Error ? err.message : "Failed to post comment"
      );
    } finally {
      setPosting(false);
    }
  };

  if (!task || !form) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">
            {canEdit ? "Task details" : task.title}
          </DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Edit the task, then save your changes."
              : "You have read-only access to this project."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={form.title}
              disabled={!canEdit}
              required
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              rows={4}
              value={form.description}
              disabled={!canEdit}
              placeholder="What needs to happen, and why?"
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-status">Status</Label>
              <Select
                id="task-status"
                value={form.status}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as TaskStatus,
                  })
                }
              >
                {BOARD_COLUMNS.map((column) => (
                  <option key={column.status} value={column.status}>
                    {column.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <Select
                id="task-priority"
                value={form.priority}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({
                    ...form,
                    priority: event.target.value as TaskPriority,
                  })
                }
              >
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select
                id="task-assignee"
                value={form.assignee_id}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({ ...form, assignee_id: event.target.value })
                }
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || member.email}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={form.due_date}
                disabled={!canEdit}
                onChange={(event) =>
                  setForm({ ...form, due_date: event.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-tags">Labels</Label>
            <Input
              id="task-tags"
              value={form.tags}
              disabled={!canEdit}
              placeholder="gameplay, rendering, tech-debt"
              onChange={(event) =>
                setForm({ ...form, tags: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Comma separated.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {canEdit && (
            <div className="flex items-center gap-2 border-t border-border pt-4">
              {canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deleting || saving}
                  onClick={handleDelete}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </Button>
              )}

              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={saving || deleting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving || deleting}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </form>

        <section
          aria-label="Comments"
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            Comments
            {comments.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {comments.length}
              </span>
            )}
          </h3>

          {commentsLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading comments...
            </p>
          ) : commentsError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {commentsError}
            </p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => {
                const author = membersById.get(comment.author_id);

                return (
                  <li key={comment.id} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground"
                    >
                      {author ? initialsFor(author) : "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {author?.full_name || author?.email || "Unknown"}
                        </span>
                        {" · "}
                        {new Date(comment.created_at).toLocaleString()}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
                        {comment.content}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canComment && (
            <form onSubmit={handleComment} className="flex gap-2">
              <Input
                value={draft}
                placeholder="Add a comment..."
                aria-label="Add a comment"
                disabled={posting}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Post comment"
                disabled={posting || !draft.trim()}
                className={cn("shrink-0")}
              >
                {posting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
