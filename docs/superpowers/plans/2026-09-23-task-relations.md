# Task Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project member search for and link another task in the same project as "related", and see/remove those links from the task detail dialog - reusing the existing generic `context_relations` table and its `createRelation`/`deleteRelation` Server Actions entirely unmodified.

**Architecture:** No new migration, table, or RLS policy. Two new pieces: a task-scoped Server Actions file (`relations-actions.ts`) that reads/searches through the existing `context_relations` table and re-exports the existing generic create/delete actions, and a new self-contained UI section (`TaskRelationsSection`) wired into the existing task detail dialog, using that dialog's already-correct `canEdit`/`canDelete` props (confirmed to already match `context_relations`' own RLS tiers exactly).

**Tech Stack:** Next.js Server Actions, the existing `context_relations` table/RLS (migrations 000/001/011), React.

Verification throughout: `npx tsc --noEmit`, `npm run lint`, `npm run build` - no new RLS to compat-test (see spec's Testing section), so correctness is verified by reading the code plus a real browser pass against the PGlite harness this session has used repeatedly.

---

### Task 1: Server Actions (`relations-actions.ts`)

**Files:**
- Create: `src/app/projects/[id]/work/relations-actions.ts`

**Before writing:** read `src/app/projects/[id]/context/actions.ts` in full (already summarized in the spec, but confirm the exact exported signatures of `createRelation`/`deleteRelation`/`RelationFormState`/`RelationMutationResult` before importing them) and `src/app/api/v1/search/route.ts`'s task-search query shape (for the `ilike` pattern - confirm the exact column/table names it queries, e.g. whether it's `.ilike('title', ...)` via Supabase or a raw `ILIKE` in a `withUser` query, and mirror whichever `hasDirectDatabase()` branch shape this codebase's other actions use, not that route's API-key-specific shape).

- [ ] **Step 1: Write the file**

```ts
"use server";

import { getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { createClient } from "@/lib/supabase-server";

export { createRelation, deleteRelation } from "../../context/actions";

export type RelatedTask = {
  relationId: string;
  id: string;
  title: string;
  status: string;
};

const RELATION_TYPE = "related_to";

type RelationRow = {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
};

type TaskRow = { id: string; title: string; status: string };

export async function loadTaskRelatedTasks(
  projectId: string,
  taskId: string
): Promise<{ relations: RelatedTask[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { relations: [], error: "You do not have access to this project." };

  let relationRows: RelationRow[];

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `SELECT id, source_type, source_id, target_type, target_id
           FROM context_relations
           WHERE relation_type = $1
             AND ((source_type = 'task' AND source_id = $2) OR (target_type = 'task' AND target_id = $2))`,
          [RELATION_TYPE, taskId]
        )
      );
      relationRows = result.rows;
    } catch (error) {
      return { relations: [], error: error instanceof Error ? error.message : "Failed to load related tasks." };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("context_relations")
      .select("id, source_type, source_id, target_type, target_id")
      .eq("relation_type", RELATION_TYPE)
      .or(`and(source_type.eq.task,source_id.eq.${taskId}),and(target_type.eq.task,target_id.eq.${taskId})`);

    if (error) return { relations: [], error: error.message };
    relationRows = (data ?? []) as RelationRow[];
  }

  if (relationRows.length === 0) return { relations: [], error: null };

  const otherTaskIds = relationRows.map((row) =>
    row.source_type === "task" && row.source_id === taskId ? row.target_id : row.source_id
  );

  let taskRows: TaskRow[];

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(`SELECT id, title, status FROM tasks WHERE id = ANY($1::uuid[])`, [otherTaskIds])
      );
      taskRows = result.rows;
    } catch (error) {
      return { relations: [], error: error instanceof Error ? error.message : "Failed to load related tasks." };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.from("tasks").select("id, title, status").in("id", otherTaskIds);
    if (error) return { relations: [], error: error.message };
    taskRows = (data ?? []) as TaskRow[];
  }

  const taskById = new Map(taskRows.map((t) => [t.id, t]));

  const relations: RelatedTask[] = [];
  for (let i = 0; i < relationRows.length; i++) {
    const row = relationRows[i];
    const otherTask = taskById.get(otherTaskIds[i]);
    if (otherTask) {
      relations.push({ relationId: row.id, id: otherTask.id, title: otherTask.title, status: otherTask.status });
    }
  }

  return { relations, error: null };
}

export async function searchProjectTasksByTitle(
  projectId: string,
  query: string,
  excludeIds: string[]
): Promise<{ tasks: { id: string; title: string }[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { tasks: [], error: "You do not have access to this project." };

  const trimmed = query.trim();
  if (trimmed.length === 0) return { tasks: [], error: null };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query: runQuery }) =>
        runQuery(
          `SELECT id, title FROM tasks
           WHERE project_id = $1 AND title ILIKE $2 AND NOT (id = ANY($3::uuid[]))
           ORDER BY title
           LIMIT 20`,
          [projectId, `%${trimmed}%`, excludeIds.length > 0 ? excludeIds : ["00000000-0000-0000-0000-000000000000"]]
        )
      );
      return { tasks: result.rows, error: null };
    } catch (error) {
      return { tasks: [], error: error instanceof Error ? error.message : "Search failed." };
    }
  }

  const supabase = await createClient();
  let builder = supabase
    .from("tasks")
    .select("id, title")
    .eq("project_id", projectId)
    .ilike("title", `%${trimmed}%`)
    .order("title")
    .limit(20);

  if (excludeIds.length > 0) {
    builder = builder.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await builder;
  if (error) return { tasks: [], error: error.message };
  return { tasks: (data ?? []) as { id: string; title: string }[], error: null };
}
```

`excludeIds.length > 0 ? excludeIds : ["00000000-0000-0000-0000-000000000000"]` in the self-hosted branch exists because `NOT (id = ANY($3::uuid[]))` with an EMPTY array parameter is always true in Postgres (an empty array `ANY` is never matched, so `NOT` is always true) - this is harmless either way, but passing a single all-zero placeholder UUID instead of an empty array avoids relying on that edge-case behavior being remembered correctly by a future reader.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `createRelation`/`deleteRelation`'s re-export fails to resolve, confirm the relative path `../../context/actions` is correct from `src/app/projects/[id]/work/relations-actions.ts` (it should resolve to `src/app/projects/[id]/context/actions.ts` - count the `[id]` segment only once, since both files are siblings under the same `[id]/` directory, just in different subfolders `work/` and `context/`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/projects/[id]/work/relations-actions.ts"
git commit -m "Add task-relations Server Actions (list/search, reusing context_relations)"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 2: UI component (`task-relations-section.tsx`) + i18n

**Files:**
- Create: `src/components/work/task-relations-section.tsx`
- Modify: `messages/en.json`, `messages/pl.json`, `messages/de.json`, `messages/es.json`

**Before writing:** read `src/lib/work/task-board.ts`'s `BOARD_COLUMNS` export (already confirmed to have `{status, label, accentClass}` per entry, `accentClass` being a Tailwind `bg-*` class) - this component receives a `columns` prop of the same `BoardColumn[]` shape from `TaskDetailDialog` (Task 3) to resolve a related task's status label/color without hardcoding a second status-to-color mapping.

- [ ] **Step 1: Add the `work.relatedTasks*` i18n keys to all four files**

Add these keys to the existing `"work"` namespace in each of the four `messages/*.json` files (same convention as every other addition this session - append at the end of the namespace, matching how `attachments`/`images` keys were added):

| Key | en | pl | de | es |
|---|---|---|---|---|
| `relatedTasks` | Related tasks | Powiązane taski | Verknüpfte Aufgaben | Tareas relacionadas |
| `searchTasksPlaceholder` | Search tasks to link... | Szukaj taska do powiązania... | Aufgaben zum Verknüpfen suchen... | Buscar tareas para vincular... |
| `noRelatedTasksYet` | No related tasks yet. | Jeszcze brak powiązanych tasków. | Noch keine verknüpften Aufgaben. | Aún no hay tareas relacionadas. |
| `noMatchingTasks` | No matching tasks. | Brak pasujących tasków. | Keine passenden Aufgaben. | No hay tareas coincidentes. |
| `removeRelationAria` | Remove link to {title} | Usuń powiązanie z {title} | Verknüpfung zu {title} entfernen | Quitar vínculo con {title} |
| `failedToLoadRelatedTasks` | Failed to load related tasks. | Nie udało się wczytać powiązanych tasków. | Verknüpfte Aufgaben konnten nicht geladen werden. | No se pudieron cargar las tareas relacionadas. |
| `failedToLinkTask` | Failed to link the task. | Nie udało się powiązać taska. | Die Aufgabe konnte nicht verknüpft werden. | No se pudo vincular la tarea. |
| `failedToRemoveRelation` | Failed to remove the link. | Nie udało się usunąć powiązania. | Die Verknüpfung konnte nicht entfernt werden. | No se pudo eliminar el vínculo. |

- [ ] **Step 2: Verify the key sets**

Run:
```bash
node -e "
const fs = require('fs');
const sets = ['en','pl','de','es'].map(l => Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json','utf8')).work).sort().join());
console.log('identical:', sets.every(s => s === sets[0]));
"
```
Expected: `identical: true`

- [ ] **Step 3: Write the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search, X } from "lucide-react";
import {
  createRelation,
  deleteRelation,
  loadTaskRelatedTasks,
  searchProjectTasksByTitle,
  type RelatedTask,
} from "@/app/projects/[id]/work/relations-actions";
import type { BoardColumn } from "@/lib/work/task-board";

export function TaskRelationsSection({
  projectId,
  taskId,
  columns,
  canView,
  canLink,
  canRemove,
  onNavigateToTask,
}: {
  projectId: string;
  taskId: string;
  columns: readonly BoardColumn[];
  /** Always true in practice (every dialog viewer is a project member) - kept explicit rather than assumed. */
  canView: boolean;
  canLink: boolean;
  canRemove: boolean;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const t = useTranslations("work");
  const [relations, setRelations] = useState<RelatedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ id: string; title: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRelations = async () => {
    setLoading(true);
    const result = await loadTaskRelatedTasks(projectId, taskId);
    if (result.error) setError(result.error);
    else {
      setError(null);
      setRelations(result.relations);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    (async () => {
      const result = await loadTaskRelatedTasks(projectId, taskId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setRelations(result.relations);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, taskId, canView]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length === 0) {
      setMatches([]);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const excludeIds = [taskId, ...relations.map((r) => r.id)];
      const result = await searchProjectTasksByTitle(projectId, query, excludeIds);
      setMatches(result.error ? [] : result.tasks);
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relations is read for its current value at debounce-fire time, not a reactive trigger for re-search
  }, [query, projectId, taskId]);

  const handleLink = async (relatedTaskId: string) => {
    setLinkingId(relatedTaskId);
    setError(null);

    const formData = new FormData();
    formData.set("source_type", "task");
    formData.set("source_id", taskId);
    formData.set("target_type", "task");
    formData.set("target_id", relatedTaskId);
    formData.set("relation_type", "related_to");

    const result = await createRelation(projectId, { error: null }, formData);
    if (result.error) {
      setError(result.error ?? t("failedToLinkTask"));
    } else {
      setQuery("");
      setMatches([]);
      await loadRelations();
    }
    setLinkingId(null);
  };

  const handleRemove = async (relation: RelatedTask) => {
    setRemovingId(relation.relationId);
    setError(null);

    const result = await deleteRelation(projectId, relation.relationId);
    if (result.error) setError(result.error ?? t("failedToRemoveRelation"));
    else setRelations((current) => current.filter((r) => r.relationId !== relation.relationId));

    setRemovingId(null);
  };

  if (!canView) return null;

  return (
    <section aria-label={t("relatedTasks")} className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium text-foreground">
        {t("relatedTasks")}
        {relations.length > 0 && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{relations.length}</span>
        )}
      </h3>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </p>
      ) : relations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noRelatedTasksYet")}</p>
      ) : (
        <ul className="space-y-1.5">
          {relations.map((relation) => {
            const column = columns.find((c) => c.status === relation.status);
            return (
              <li
                key={relation.relationId}
                className="group flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${column?.accentClass ?? "bg-muted-foreground"}`} />
                {onNavigateToTask ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToTask(relation.id)}
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                  >
                    {relation.title}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{relation.title}</span>
                )}
                {canRemove && (
                  <button
                    type="button"
                    aria-label={t("removeRelationAria", { title: relation.title })}
                    disabled={removingId === relation.relationId}
                    onClick={() => void handleRemove(relation)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-60"
                  >
                    {removingId === relation.relationId ? (
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

      {canLink && (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchTasksPlaceholder")}
              className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm"
            />
          </div>
          {query.trim().length > 0 && (
            <ul className="space-y-1 rounded-md border border-border">
              {searching ? (
                <li className="p-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </li>
              ) : matches.length === 0 ? (
                <li className="p-2 text-sm text-muted-foreground">{t("noMatchingTasks")}</li>
              ) : (
                matches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      disabled={linkingId === match.id}
                      onClick={() => void handleLink(match.id)}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                    >
                      <span className="min-w-0 truncate">{match.title}</span>
                      {linkingId === match.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`BoardColumn` is confirmed already exported from `src/lib/work/task-board.ts:22`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/work/task-relations-section.tsx messages/en.json messages/pl.json messages/de.json messages/es.json
git commit -m "Add TaskRelationsSection UI and its i18n keys"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 3: Wire into `task-detail-dialog.tsx`

**Files:**
- Modify: `src/components/work/task-detail-dialog.tsx`

- [ ] **Step 1: Add the `onNavigateToTask` prop and import**

In `src/components/work/task-detail-dialog.tsx`, add to the `TaskDetailDialogProps` interface (right after the existing `onDeleted: (taskId: string) => void;` line):

```ts
  /** Lets a related-task link (TaskRelationsSection) switch the dialog to another task without closing it - optional, degrades to plain non-clickable text if the caller doesn't pass it. */
  onNavigateToTask?: (taskId: string) => void;
```

Add the destructured prop to the `TaskDetailDialog({ ... })` function's parameter list (next to `onDeleted`):

```ts
  onNavigateToTask,
```

Add the import next to the existing `TaskAttachmentsSection`/`TaskImagePreview` imports:

```ts
import { TaskRelationsSection } from "@/components/work/task-relations-section";
```

- [ ] **Step 2: Render the section**

Find where `<TaskAttachmentsSection ... />` is rendered. Render `<TaskRelationsSection>` immediately after it, passing:

```tsx
<TaskRelationsSection
  projectId={projectId}
  taskId={task.id}
  columns={columns}
  canView={true}
  canLink={canEdit}
  canRemove={canDelete}
  onNavigateToTask={onNavigateToTask}
/>
```

(`canEdit`/`canDelete` are the dialog's own existing props, already confirmed to match `context_relations_insert`'s owner/admin/developer tier and `context_relations_delete`'s owner/admin tier exactly - see the spec's "Permission tiers" section. `columns` is already a prop on this dialog with a default of `BOARD_COLUMNS`, so it's always defined here even though its own prop declaration marks it optional.)

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit` - expect no errors.
Run: `npm run lint` - expect no new errors in files this task touched (check the current baseline count first if unsure).
Run: `npm run build` - expect it to build cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/components/work/task-detail-dialog.tsx
git commit -m "Wire TaskRelationsSection into the task detail dialog"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 4: Wire `onNavigateToTask` in both dialog call sites, final verification

**Files:**
- Modify: `src/app/projects/[id]/work/work-board.tsx`
- Modify: `src/app/projects/[id]/calendar/calendar-view.tsx`

**Before writing:** both files already hold `openTask`/`setOpenTask` state and a `tasks` array used for `upsertTask`/`removeTask` (confirmed by reading both files directly - `work-board.tsx`'s `<TaskDetailDialog>` call is around line 367, `calendar-view.tsx`'s around line 163). Re-read each file's actual current state/prop names at the point of editing, since line numbers shift as other concurrent work lands in this repository.

- [ ] **Step 1: Add `onNavigateToTask` to `work-board.tsx`'s `<TaskDetailDialog>` call**

Find the `<TaskDetailDialog ... onDeleted={removeTask} />` call in `work-board.tsx`. Add:

```tsx
onNavigateToTask={(taskId) => {
  const target = tasks.find((t) => t.id === taskId);
  if (target) setOpenTask(target);
}}
```

(`tasks` and `setOpenTask` are this file's own existing state - confirm their exact names match at the edit site; adjust only if they differ from what was read during exploration.)

- [ ] **Step 2: Add the same wiring to `calendar-view.tsx`**

Find the `<TaskDetailDialog ... onSaved={upsertTask} ... />` call in `calendar-view.tsx`. Add the identical prop:

```tsx
onNavigateToTask={(taskId) => {
  const target = tasks.find((t) => t.id === taskId);
  if (target) setOpenTask(target);
}}
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build` - expect all clean, matching Task 3's baseline.

- [ ] **Step 4: Real-browser verification against the PGlite harness**

Using this session's established PGlite-behind-TCP-forwarder + hand-signed-session-cookie harness (reused ~8 times this session): seed two tasks in the same project, open the first task's detail dialog, use the new search box to find and link the second task, confirm it appears in the "Related tasks" list. Open the second task directly (close the first dialog, open the second) and confirm the first task now appears in ITS "Related tasks" list too - this is the one behavior that specifically proves the bidirectional `(source_type='task' AND source_id=taskId) OR (target_type='task' AND target_id=taskId)` query works, since the relation was created with the first task as `source` and the second as `target`. Click the related task's title from within the first task's dialog and confirm the dialog switches to show the second task's own details (not just closes). Remove the relation from one side and confirm a reload shows it gone from both.

- [ ] **Step 5: Commit**

```bash
git add "src/app/projects/[id]/work/work-board.tsx" "src/app/projects/[id]/calendar/calendar-view.tsx"
git commit -m "Wire related-task navigation into both TaskDetailDialog call sites"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## Self-Review

**Spec coverage:** "What's actually missing" section's three numbered gaps are covered exactly: (1) task-scoped bidirectional read → `loadTaskRelatedTasks` (Task 1), (2) search-by-title picker → `searchProjectTasksByTitle` + the search UI (Tasks 1, 2), (3) dialog wiring + navigate-on-click → Tasks 3-4. Permission tiers section is honored (Task 3 passes `canEdit`/`canDelete` straight through, no new derived value invented). i18n section covered (Task 2). Non-goals honored (no relation-type picker in the UI, no cross-project search, no Kanban card change, no activity logging anywhere in this plan).

**Type consistency:** `RelatedTask{relationId, id, title, status}` (Task 1) is the only shape `TaskRelationsSection` (Task 2) consumes - field names match exactly. `loadTaskRelatedTasks`/`searchProjectTasksByTitle`/`createRelation`/`deleteRelation` (Task 1's exports) are the exact four names Task 2's component imports - no renamed or duplicated function. `onNavigateToTask` is declared with the identical signature (`(taskId: string) => void`, optional) in Task 3's prop addition, Task 2's component prop, and Task 4's two call sites.

**Placeholder scan:** every step has real, complete code or an exact command - no "add error handling"/"similar to Task N" shortcuts. Task 4's own note about re-reading exact state names before editing is a stated verification step, not a placeholder for the edit itself (the edit's exact code is given in full).
