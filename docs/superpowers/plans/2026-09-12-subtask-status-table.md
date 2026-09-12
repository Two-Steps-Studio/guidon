# Subtask Status Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a task's "Subtasks" checklist into an editable table where each row's title can be renamed and its status can be set to any of the project's task statuses (not just done/not-done).

**Architecture:** No schema change. Subtasks are already full `tasks` rows with a real `status` column; this is a UI rewrite of one section of `task-detail-dialog.tsx` plus deleting one now-redundant server action (`toggleSubtask`) in favor of the already-audited, general-purpose `updateTask`.

**Tech Stack:** Next.js Server Actions, React (client component), no new dependencies. This repo has no component/unit test runner (only Node-script integration tests for DB/RLS, AI, auth, and limits — see `package.json`'s `test:*` scripts), so verification for the UI portion is `npx tsc --noEmit` + `npm run lint` + `npm run build` + a manual browser check, matching how every other UI change in this codebase has been verified; `npm run test:db` covers the one RLS-adjacent code path touched (`updateTask`).

Reference spec: `docs/superpowers/specs/2026-09-12-subtask-status-table-design.md`

---

### Task 1: Retire `toggleSubtask`, rebuild the Subtasks section as an editable table

**Files:**
- Modify: `src/app/projects/[id]/work/actions.ts:752-826` (delete the `toggleSubtask` export)
- Modify: `src/components/work/task-detail-dialog.tsx` (imports, state, handlers, JSX)

- [ ] **Step 1: Delete `toggleSubtask` from actions.ts**

Confirmed via grep that `task-detail-dialog.tsx` is the only caller (the one other match, in `src/app/projects/[id]/context/actions.ts:122`, is a comment, not a call).

In `src/app/projects/[id]/work/actions.ts`, delete the entire function at lines 752-826:

```ts
export async function toggleSubtask(
  projectId: string,
  subtaskId: string,
  done: boolean
): Promise<TaskActionResult> {
  const access = await getProjectAccess(projectId);
  // Mirrors tasks_update (001): owner/admin/developer.
  if (!access || !canWriteProject(access.role)) {
    return { task: null, error: "You do not have permission to update this subtask." };
  }

  const newStatus = done ? "done" : "todo";

  if (hasDirectDatabase()) {
    try {
      // Scoped to project_id and parent_task_id IS NOT NULL: without them,
      // this would update ANY task id passed in (a top-level task, or one
      // from a different project this caller might have write access to
      // under a different role) - RLS's tasks_update still gates the write
      // itself either way, but a mismatch used to come back as a silent
      // `{ task: undefined, error: null }` "success" instead of the clear
      // rejection this now gives, the same class of bug fixed in
      // task-transitions.ts for the AI Task API's status endpoints.
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `UPDATE tasks SET status = $1
           WHERE id = $2 AND project_id = $3 AND parent_task_id IS NOT NULL
           RETURNING *`,
          [newStatus, subtaskId, projectId]
        )
      );
      if (result.rows.length === 0) {
        return { task: null, error: "This subtask could not be found in this project." };
      }

      await logActivity({
        userId: access.userId,
        action: "task_status_changed",
        projectId,
        entityType: "task",
        entityId: subtaskId,
        details: { status: newStatus },
      });

      revalidatePath(`/projects/${projectId}/work`);
      return { task: result.rows[0] as Task, error: null };
    } catch (error) {
      return { task: null, error: error instanceof Error ? error.message : "Failed to update this subtask." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", subtaskId)
    .eq("project_id", projectId)
    .not("parent_task_id", "is", null)
    .select()
    .single();

  if (error) return { task: null, error: error.message };

  await logActivity({
    userId: access.userId,
    action: "task_status_changed",
    projectId,
    entityType: "task",
    entityId: subtaskId,
    details: { status: newStatus },
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { task: data as Task, error: null };
}
```

The file's `updateTask` (already scoped by `project_id` with a rowcount/`.select()` check) is the direct replacement — no new backend code is needed. Do not run `tsc`/`lint`/`build` yet; `task-detail-dialog.tsx` still imports the now-deleted function and will not compile until Step 2 is done.

- [ ] **Step 2: Update the import list in task-detail-dialog.tsx**

In `src/components/work/task-detail-dialog.tsx`, the import block currently reads:

```tsx
import {
  createSubtask,
  deleteTask,
  loadComments as loadCommentsAction,
  postComment,
  toggleSubtask,
  updateTask,
  type TaskComment,
} from "@/app/projects/[id]/work/actions";
```

Remove the `toggleSubtask,` line so it reads:

```tsx
import {
  createSubtask,
  deleteTask,
  loadComments as loadCommentsAction,
  postComment,
  updateTask,
  type TaskComment,
} from "@/app/projects/[id]/work/actions";
```

`updateTask` is already imported (it's used by the main task's own save handler), so no new import is needed for it.

- [ ] **Step 3: Add a per-subtask status-options helper**

In `src/components/work/task-detail-dialog.tsx`, this module-level helper already exists above the component (around line 71):

```tsx
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
```

Immediately after it, add:

```tsx
/**
 * A subtask can be sitting on a status the project has since hidden from
 * the board (same reasoning as the parent task's own `statusOptions` below)
 * - keep it selectable rather than silently omitting it from the dropdown.
 */
function subtaskStatusOptions(
  status: TaskStatus,
  columns: readonly BoardColumn[]
): readonly BoardColumn[] {
  return columns.some((c) => c.status === status)
    ? columns
    : [...columns, BOARD_COLUMNS.find((c) => c.status === status)!];
}
```

This reuses the exact same fallback logic the file already applies to the parent task's own status field (`statusOptions`, computed inside the component body) — `BOARD_COLUMNS` and `BoardColumn` are already imported at the top of this file.

- [ ] **Step 4: Replace subtask-related state and handlers**

In `src/components/work/task-detail-dialog.tsx`, this block currently reads (around line 286):

```tsx
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [togglingSubtaskId, setTogglingSubtaskId] = useState<string | null>(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null);

  const handleAddSubtask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !subtaskDraft.trim()) return;

    setAddingSubtask(true);
    setSubtaskError(null);

    try {
      const result = await createSubtask(projectId, task.id, subtaskDraft.trim());
      if (result.error || !result.task) throw new Error(result.error ?? "Failed to create subtask");

      // Subtasks are plain tasks, so the same onSaved callback that updates
      // the board's task list handles them - no separate state to sync.
      onSaved(result.task);
      setSubtaskDraft("");
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : "Failed to create subtask");
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtask: Task) => {
    setTogglingSubtaskId(subtask.id);
    setSubtaskError(null);

    try {
      const result = await toggleSubtask(projectId, subtask.id, !isDone(subtask.status));
      if (result.error || !result.task) throw new Error(result.error ?? "Failed to update subtask");

      onSaved(result.task);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : "Failed to update subtask");
    } finally {
      setTogglingSubtaskId(null);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    setDeletingSubtaskId(subtaskId);
    setSubtaskError(null);

    try {
      const result = await deleteTask(projectId, subtaskId);
      if (result.error) throw new Error(result.error);

      onDeleted(subtaskId);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : "Failed to delete subtask");
    } finally {
      setDeletingSubtaskId(null);
    }
  };
```

Replace the whole block with:

```tsx
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [savingSubtaskId, setSavingSubtaskId] = useState<string | null>(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null);
  // Keyed by subtask id. Only holds an entry while that row has an
  // in-flight or not-yet-committed edit - absence means "show the row's
  // own field", so a successful or failed save both fall back to the
  // latest server value once the entry is removed in `finally`.
  const [subtaskTitleDrafts, setSubtaskTitleDrafts] = useState<Record<string, string>>({});
  const [subtaskStatusDrafts, setSubtaskStatusDrafts] = useState<Record<string, TaskStatus>>({});

  function clearDraft<T>(setter: React.Dispatch<React.SetStateAction<Record<string, T>>>, id: string) {
    setter((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  const handleAddSubtask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !subtaskDraft.trim()) return;

    setAddingSubtask(true);
    setSubtaskError(null);

    try {
      const result = await createSubtask(projectId, task.id, subtaskDraft.trim());
      if (result.error || !result.task) throw new Error(result.error ?? "Failed to create subtask");

      // Subtasks are plain tasks, so the same onSaved callback that updates
      // the board's task list handles them - no separate state to sync.
      onSaved(result.task);
      setSubtaskDraft("");
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : "Failed to create subtask");
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleSubtaskStatusChange = async (subtask: Task, status: TaskStatus) => {
    // Set immediately so the (now-disabled) <select> shows the chosen value
    // for the duration of the request instead of snapping back to the old
    // one until `onSaved` updates `subtask` from the parent.
    setSubtaskStatusDrafts((current) => ({ ...current, [subtask.id]: status }));
    setSavingSubtaskId(subtask.id);
    setSubtaskError(null);

    try {
      const result = await updateTask(projectId, subtask.id, { status });
      if (result.error || !result.task) throw new Error(result.error ?? "Failed to update subtask");

      onSaved(result.task);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : "Failed to update subtask");
    } finally {
      setSavingSubtaskId(null);
      clearDraft(setSubtaskStatusDrafts, subtask.id);
    }
  };

  const handleSubtaskTitleCommit = async (subtask: Task) => {
    const draft = (subtaskTitleDrafts[subtask.id] ?? subtask.title).trim();

    if (!draft || draft === subtask.title) {
      clearDraft(setSubtaskTitleDrafts, subtask.id);
      return;
    }

    setSavingSubtaskId(subtask.id);
    setSubtaskError(null);

    try {
      const result = await updateTask(projectId, subtask.id, { title: draft });
      if (result.error || !result.task) throw new Error(result.error ?? "Failed to rename subtask");

      onSaved(result.task);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : "Failed to rename subtask");
    } finally {
      setSavingSubtaskId(null);
      clearDraft(setSubtaskTitleDrafts, subtask.id);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    setDeletingSubtaskId(subtaskId);
    setSubtaskError(null);

    try {
      const result = await deleteTask(projectId, subtaskId);
      if (result.error) throw new Error(result.error);

      onDeleted(subtaskId);
    } catch (err) {
      setSubtaskError(err instanceof Error ? err.message : "Failed to delete subtask");
    } finally {
      setDeletingSubtaskId(null);
    }
  };
```

Note `isDone` is no longer used by a handler here, but it is still used by the progress-counter JSX in Step 5, so keep its import.

- [ ] **Step 5: Replace the Subtasks section JSX**

In `src/components/work/task-detail-dialog.tsx`, the `<section aria-label="Subtasks" ...>` block currently reads:

```tsx
        <section
          aria-label="Subtasks"
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            Subtasks
            {subtasks.length > 0 && (
              <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                {subtasks.filter((subtask) => isDone(subtask.status)).length}/{subtasks.length}
              </span>
            )}
          </h3>

          {subtasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subtasks yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {subtasks.map((subtask) => {
                const done = isDone(subtask.status);
                return (
                  <li key={subtask.id} className="group flex items-center gap-2">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      aria-label={
                        done
                          ? `Mark "${subtask.title}" as not done`
                          : `Mark "${subtask.title}" as done`
                      }
                      disabled={!canEdit || togglingSubtaskId === subtask.id}
                      onClick={() => void handleToggleSubtask(subtask)}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border text-primary-foreground",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        done && "border-primary bg-primary"
                      )}
                    >
                      {togglingSubtaskId === subtask.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : done ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </button>
                    <span
                      className={cn(
                        "flex-1 truncate text-sm text-foreground",
                        done && "text-muted-foreground line-through"
                      )}
                    >
                      {subtask.title}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        aria-label={`Delete subtask "${subtask.title}"`}
                        disabled={deletingSubtaskId === subtask.id}
                        onClick={() => void handleDeleteSubtask(subtask.id)}
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-60"
                      >
                        {deletingSubtaskId === subtask.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {subtaskError && (
            <p role="alert" className="text-sm text-destructive">
              {subtaskError}
            </p>
          )}

          {canEdit && (
            <form onSubmit={handleAddSubtask} className="flex gap-2">
              <Input
                value={subtaskDraft}
                placeholder="Add a subtask..."
                aria-label="Add a subtask"
                disabled={addingSubtask}
                onChange={(event) => setSubtaskDraft(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Add subtask"
                disabled={addingSubtask || !subtaskDraft.trim()}
                className="shrink-0"
              >
                {addingSubtask ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}
        </section>
```

Replace the whole block with:

```tsx
        <section
          aria-label="Subtasks"
          className="space-y-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium text-foreground">
            Subtasks
            {subtasks.length > 0 && (
              <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                {subtasks.filter((subtask) => isDone(subtask.status)).length}/{subtasks.length}
              </span>
            )}
          </h3>

          {subtasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subtasks yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {subtasks.map((subtask) => {
                  const normalizedStatus = normalizeTaskStatus(subtask.status);
                  const statusValue = subtaskStatusDrafts[subtask.id] ?? normalizedStatus;
                  const titleValue = subtaskTitleDrafts[subtask.id] ?? subtask.title;
                  const saving = savingSubtaskId === subtask.id;

                  return (
                    <tr key={subtask.id} className="group">
                      <td className="w-full py-1 pr-2">
                        <Input
                          value={titleValue}
                          aria-label={`Subtask title: ${subtask.title}`}
                          disabled={!canEdit || saving}
                          className="h-8"
                          onChange={(event) =>
                            setSubtaskTitleDrafts((current) => ({
                              ...current,
                              [subtask.id]: event.target.value,
                            }))
                          }
                          onBlur={() => void handleSubtaskTitleCommit(subtask)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            } else if (event.key === "Escape") {
                              clearDraft(setSubtaskTitleDrafts, subtask.id);
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Select
                          aria-label={`Status for "${subtask.title}"`}
                          className="h-8 w-36"
                          value={statusValue}
                          disabled={!canEdit || saving}
                          onChange={(event) =>
                            void handleSubtaskStatusChange(subtask, event.target.value as TaskStatus)
                          }
                        >
                          {subtaskStatusOptions(statusValue, columns).map((column) => (
                            <option key={column.status} value={column.status}>
                              {column.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-1">
                        {canDelete && (
                          <button
                            type="button"
                            aria-label={`Delete subtask "${subtask.title}"`}
                            disabled={deletingSubtaskId === subtask.id}
                            onClick={() => void handleDeleteSubtask(subtask.id)}
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-60"
                          >
                            {deletingSubtaskId === subtask.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {subtaskError && (
            <p role="alert" className="text-sm text-destructive">
              {subtaskError}
            </p>
          )}

          {canEdit && (
            <form onSubmit={handleAddSubtask} className="flex gap-2">
              <Input
                value={subtaskDraft}
                placeholder="Add a subtask..."
                aria-label="Add a subtask"
                disabled={addingSubtask}
                onChange={(event) => setSubtaskDraft(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Add subtask"
                disabled={addingSubtask || !subtaskDraft.trim()}
                className="shrink-0"
              >
                {addingSubtask ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </form>
          )}
        </section>
```

`Check` and `cn` may now be unused in this file if nothing else references them — the next step's build/lint pass will catch that; do not remove either import speculatively before checking (see Step 6/7). `X` and `Loader2` are still used above (delete button, add-subtask spinner) and elsewhere in the file, so they stay regardless.

- [ ] **Step 6: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors. If `Check` or `cn` show as unused-import errors (this project's ESLint, not `tsc`, flags unused imports — `tsc` itself won't fail on an unused import), skip for now and handle in Step 7.

- [ ] **Step 7: Lint**

Run:

```bash
npm run lint
```

Expected: no new errors in `src/app/projects/[id]/work/actions.ts` or `src/components/work/task-detail-dialog.tsx`. This repo has pre-existing `@typescript-eslint/no-explicit-any` errors in unrelated files (confirmed earlier this session in `search/route.ts`, `storage.ts`, etc.) — ignore those, they predate this change.

If lint reports `Check` as unused in `task-detail-dialog.tsx`: check whether it's still used elsewhere in the file (as of this plan's writing, it is — the "Export agent context" copy-button at approximately line 801 renders `agentContextCopied ? <Check ... /> : <Copy ... />`). If lint still flags it as unused, that means this plan's assumption was wrong for some reason — re-check with `grep -n "Check" src/components/work/task-detail-dialog.tsx` before removing the import, since removing a still-used import would be a bug, not a fix. If `cn` is genuinely unused after this change (the deleted checkbox `<button>` was its only remaining call site in this file — verify with `grep -n "cn(" src/components/work/task-detail-dialog.tsx`), remove `cn` from the top import line.

- [ ] **Step 8: Build**

Run:

```bash
npm run build
```

Expected: build succeeds, `/projects/[id]/work` still listed as a route in the output.

- [ ] **Step 9: Run the DB/RLS regression suite**

Run:

```bash
npm run test:db
```

Expected: `132 pass / 0 fail` (same count as before this change — no migration was added, this just confirms `updateTask`'s existing RLS-adjacent behavior wasn't disturbed).

- [ ] **Step 10: Manual browser check**

Start the dev server and open a project with at least one task that has subtasks (or create one):

1. Open a task, add a subtask via the existing "Add a subtask..." field — confirm it appears as a table row with status "Todo".
2. Click into the title cell, change the text, click elsewhere (blur) — confirm the new title persists after closing and reopening the task dialog.
3. Click into the title cell, change the text, press Escape — confirm it reverts to the original title without saving.
4. Change the status dropdown to "Review" — confirm the dropdown shows "Review" immediately and stays there after the request completes (no flicker back to the old value), and that the `x/y done` counter in the section header does not count it.
5. Change the status dropdown to "Done" — confirm the `x/y done` counter increments.
6. Delete a subtask via the existing delete (X) button — confirm it disappears from the table and from the board's subtask-count badge.
7. Confirm a read-only viewer (a user without `canEdit`) sees the title input and status dropdown disabled, matching the old checkbox's disabled behavior.

- [ ] **Step 11: Commit**

```bash
git add src/app/projects/[id]/work/actions.ts src/components/work/task-detail-dialog.tsx
git commit -m "$(cat <<'EOF'
Turn the subtask checklist into an editable status table

Subtasks already carry the same TaskStatus enum as a full task (including
"review", which the checkbox UI could never reach), and are already
correctly project-scoped via updateTask. Retires toggleSubtask (its only
caller) in favor of calling updateTask directly for both title and status
edits, and replaces the checkbox list with a table: an inline-editable
title (commits on blur/Enter, reverts on Escape) and a status dropdown
seeded from the project's configured board columns.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan self-review

**Spec coverage:**
- "No schema change" — Task 1 touches no migrations. ✓
- "Retire `toggleSubtask`, use `updateTask` directly" — Step 1 (delete), Steps 4-5 (call sites switched). ✓
- "Title: inline input, commit on blur/Enter, revert on Escape" — Step 4 (`handleSubtaskTitleCommit`), Step 5 (`onBlur`/`onKeyDown`). ✓
- "Status: dropdown from the project's configured columns, commits on change" — Step 3 (`subtaskStatusOptions`), Step 4 (`handleSubtaskStatusChange`), Step 5 (`<Select>`). ✓
- "Delete unchanged" — Step 5 keeps the existing delete button/handler verbatim. ✓
- "Progress counter keeps working" — Step 5 keeps the `x/y done` header unchanged, still keyed off `isDone`. ✓
- "Per-row busy/error state so one row's save can't block others" — `savingSubtaskId`/`deletingSubtaskId` are keyed by subtask id, unchanged in spirit from before. ✓
- "A failed save reverts to last known-good value" — both draft maps are cleared in `finally` regardless of success/failure, and a `<select>`/`<input>` with no draft entry falls back to reading straight from the (unchanged, on failure) `subtask` prop. ✓
- Out-of-scope items (other 3 planning improvements, main task's own save-button UX, reordering, notifications) — none touched by this plan. ✓

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step shows complete, copy-pasteable code or an exact command with expected output.

**Type consistency:** `handleSubtaskStatusChange(subtask: Task, status: TaskStatus)` matches the `<Select onChange>` call site (`event.target.value as TaskStatus`); `clearDraft<T>(setter, id)` is used identically for both `Record<string, string>` (title) and `Record<string, TaskStatus>` (status) via its generic; `subtaskStatusOptions(status: TaskStatus, columns: readonly BoardColumn[])` matches both its Step 3 definition and its Step 5 call site (`subtaskStatusOptions(statusValue, columns)`, where `statusValue: TaskStatus`).
