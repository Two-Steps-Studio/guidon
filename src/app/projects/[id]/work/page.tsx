"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Loader2, Plus } from "lucide-react";
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
import { KanbanBoard } from "@/components/work/kanban-board";
import { TaskDetailDialog } from "@/components/work/task-detail-dialog";
import type { TaskCardMember } from "@/components/work/task-card";
import {
  BOARD_COLUMNS,
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  boardProgress,
  compareTasks,
  normalizeTaskStatus,
} from "@/lib/work/task-board";
import { useProjectAccess } from "@/contexts/project-access-context";
import type { Task, TaskPriority, TaskStatus } from "@/types/task";

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

/**
 * PostgREST types an embedded relation as an array or a single object
 * depending on how it infers cardinality, so both shapes are accepted.
 */
interface MemberRow {
  user_id: string;
  profiles: ProfileRow | ProfileRow[] | null;
}

interface WorkState {
  tasks: Task[];
  members: TaskCardMember[];
  commentCounts: Record<string, number>;
}

const EMPTY_STATE: WorkState = {
  tasks: [],
  members: [],
  commentCounts: {},
};

export default function ProjectWorkPage() {
  const params = useParams();
  const projectId = params.id as string;

  // Project, role and identity are resolved server-side in
  // /projects/[id]/layout.tsx; this page only loads its own data.
  const { userId, project, role, canWrite, canComment } = useProjectAccess();
  const canDelete = role === "owner" || role === "admin";

  const [state, setState] = useState<WorkState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [createFor, setCreateFor] = useState<TaskStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();

      const [tasksRes, membersRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .eq("project_id", projectId),
        supabase
          .from("project_members")
          .select("user_id, profiles ( id, full_name, email, avatar_url )")
          .eq("project_id", projectId),
      ]);

      setError(null);

      if (tasksRes.error) throw tasksRes.error;
      if (membersRes.error) throw membersRes.error;

      // profiles may be null for teammates until migration 003 is applied;
      // fall back to a stable placeholder rather than dropping the member.
      const members: TaskCardMember[] = (
        (membersRes.data ?? []) as MemberRow[]
      ).map((row) => {
        const profile = Array.isArray(row.profiles)
          ? row.profiles[0]
          : row.profiles;

        return {
          id: profile?.id ?? row.user_id,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? "Unknown member",
          avatar_url: profile?.avatar_url ?? null,
        };
      });

      const tasks = (tasksRes.data ?? []).slice().sort(compareTasks);

      const commentCounts = await loadCommentCounts(
        supabase,
        tasks.map((task) => task.id)
      );

      setState({ tasks, members, commentCounts });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load work");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Load-on-mount. The rule traces through the async body and flags the
  // setState calls, but they all happen after an await, which is exactly the
  // "subscribe to an external system and setState in the callback" shape the
  // rule documents as correct. Converting this page to a Server Component
  // would remove the effect entirely and is the right longer-term fix.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const canEdit = canWrite;

  const progress = useMemo(() => boardProgress(state.tasks), [state.tasks]);

  const handleMove = async (
    task: Task,
    status: TaskStatus,
    sortOrder: number
  ) => {
    const previous = state.tasks;

    // Optimistic: the board should feel instant on drop.
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === task.id
          ? { ...item, status, sort_order: sortOrder }
          : item
      ),
    }));

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("tasks")
        .update({ status, sort_order: Math.round(sortOrder) })
        .eq("id", task.id);

      if (updateError) throw updateError;
    } catch (err) {
      setState((current) => ({ ...current, tasks: previous }));
      setError(
        err instanceof Error ? err.message : "Could not move that task"
      );
    }
  };

  const upsertTask = (task: Task) =>
    setState((current) => ({
      ...current,
      tasks: current.tasks.some((item) => item.id === task.id)
        ? current.tasks.map((item) => (item.id === task.id ? task : item))
        : [...current.tasks, task],
    }));

  const removeTask = (taskId: string) =>
    setState((current) => ({
      ...current,
      tasks: current.tasks.filter((item) => item.id !== taskId),
    }));

  // ---- states -------------------------------------------------

  if (loading) {
    return (
      <>
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading work...
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-[1600px] p-6">
        <header className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Work
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {project.name}
              {progress.total > 0 && (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {progress.done}/{progress.total} done ({progress.percent}%)
                  </span>
                  {progress.inFlight > 0 && (
                    <>
                      {" · "}
                      <span className="tabular-nums">
                        {progress.inFlight} in progress
                      </span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          {canEdit && (
            <Button size="sm" onClick={() => setCreateFor("todo")}>
              <Plus className="h-4 w-4" />
              New task
            </Button>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {!canEdit && role && (
          <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            You have <strong className="font-medium">{role}</strong>{" "}
            access — the board is read-only.
          </p>
        )}

        {state.tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center">
            <h2 className="text-sm font-medium text-foreground">
              No tasks yet
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {canEdit
                ? "Create the first task to start tracking work on this project."
                : "Nothing has been planned for this project yet."}
            </p>
            {canEdit && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setCreateFor("todo")}
              >
                <Plus className="h-4 w-4" />
                New task
              </Button>
            )}
          </div>
        ) : (
          <KanbanBoard
            tasks={state.tasks}
            members={state.members}
            commentCounts={state.commentCounts}
            canEdit={canEdit}
            onOpenTask={setOpenTask}
            onCreateTask={setCreateFor}
            onMoveTask={handleMove}
          />
        )}
      </div>

      <TaskDetailDialog
        key={openTask?.id ?? "no-task"}
        task={openTask}
        members={state.members}
        canEdit={canEdit}
        canDelete={canDelete}
        canComment={canComment}
        currentUserId={userId}
        onClose={() => setOpenTask(null)}
        onSaved={upsertTask}
        onDeleted={removeTask}
      />

      <CreateTaskDialog
        key={createFor ?? "no-column"}
        projectId={projectId}
        status={createFor}
        members={state.members}
        currentUserId={userId}
        existingTasks={state.tasks}
        onClose={() => setCreateFor(null)}
        onCreated={upsertTask}
      />
    </>
  );
}

/**
 * task_comments has no aggregate endpoint through PostgREST without a view,
 * so counts are derived from a single scoped id fetch. Cheap at MVP volumes
 * and avoids adding a database view before it is needed.
 */
async function loadCommentCounts(
  supabase: ReturnType<typeof createClient>,
  taskIds: string[]
): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};

  const { data, error } = await supabase
    .from("task_comments")
    .select("task_id")
    .in("task_id", taskIds);

  if (error || !data) return {};

  return (data as { task_id: string }[]).reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
      return counts;
    },
    {}
  );
}

// ============================================
// CREATE TASK
// ============================================

function CreateTaskDialog({
  projectId,
  status,
  members,
  currentUserId,
  existingTasks,
  onClose,
  onCreated,
}: {
  projectId: string;
  status: TaskStatus | null;
  members: TaskCardMember[];
  currentUserId: string | null;
  existingTasks: Task[];
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The parent keys this component by target column, so opening the dialog
  // for a different column remounts it with a clean form.
  if (!status) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUserId) return;

    setSubmitting(true);
    setError(null);

    try {
      const columnTasks = existingTasks.filter(
        (task) => normalizeTaskStatus(task.status) === status
      );
      const maxOrder = columnTasks.reduce(
        (max, task) => Math.max(max, task.sort_order ?? 0),
        0
      );

      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          assignee_id: assigneeId || null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          tags: [],
          created_by: currentUserId,
          sort_order: maxOrder + 100,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      onCreated(data as Task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const columnLabel =
    BOARD_COLUMNS.find((column) => column.status === status)?.label ?? status;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">New task</DialogTitle>
          <DialogDescription>
            It will be added to <strong>{columnLabel}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-task-title">Title</Label>
            <Input
              id="new-task-title"
              value={title}
              required
              autoFocus
              placeholder="Implement save-game serialisation"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-task-description">Description</Label>
            <Textarea
              id="new-task-description"
              rows={3}
              value={description}
              placeholder="Optional context, acceptance criteria, links..."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="new-task-priority">Priority</Label>
              <Select
                id="new-task-priority"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority)
                }
              >
                {TASK_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-task-assignee">Assignee</Label>
              <Select
                id="new-task-assignee"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
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
              <Label htmlFor="new-task-due">Due date</Label>
              <Input
                id="new-task-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !title.trim()}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
