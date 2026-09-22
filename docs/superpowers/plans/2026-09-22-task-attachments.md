# Task Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project member attach files (images, text files, anything within the existing extension/size allowlist) to a task, and see/download/delete them from the task detail dialog.

**Architecture:** A new `task_attachments` table (RLS mirrors `task_comments`, one join through `tasks` for `project_id` since the table has none of its own) plus Server Actions that wire the ALREADY-WORKING but currently-unused storage-layer functions (`uploadTaskAttachment`/`deleteTaskAttachment` in `src/lib/storage/storage.ts`, and the reserved `STORAGE_BUCKETS.ATTACHMENTS` bucket) into a DB-backed list, and a self-contained UI section in the task dialog mirroring `TaskAttemptsSection`'s existing pattern.

**Tech Stack:** PostgreSQL migration, Next.js Server Actions, the existing `StorageProvider` abstraction (works identically self-hosted and Supabase).

Verification throughout: `npx tsc --noEmit`, `npm run lint`, `npm run test:db`, `npm run build` — this repo has no component/unit test runner (per `CLAUDE.md`), so UI correctness is verified by reading the code plus a real browser pass against the PGlite harness already used repeatedly this session, not by writing component tests.

---

### Task 1: Migration 041 + compat tests

**Files:**
- Create: `src/db/migrations/041_task_attachments.sql`
- Modify: `src/db/migrations/README.md`
- Modify: `tests/db/compat.test.mjs`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- GUIDON - MIGRACJA 041
-- Zalaczniki do zadan (task_attachments)
-- ============================================================
--
-- Uruchomic PO 040.
--
-- Warstwa storage (src/lib/storage/storage.ts: uploadTaskAttachment/
-- deleteTaskAttachment) i kubelek STORAGE_BUCKETS.ATTACHMENTS juz istnieja
-- i dzialaja - byly nieuzywane, bo brakowalo tabeli do sledzenia metadanych
-- (nazwa, kto wgral, kiedy) i Server Actions/UI. Ta migracja dodaje sama
-- tabele; polaczenie z UI jest w kolejnych zadaniach tego planu.
--
-- Brak kolumny project_id - wyprowadzana przez jedno polaczenie z tasks,
-- dokladnie jak task_comments (001). Brak kolumny category (w
-- odroznieniu od project_files) - to zalacznik do jednego zadania, nie
-- skategoryzowana biblioteka dokumentow projektu.
--
-- RLS: SELECT/INSERT mirror task_comments_select/task_comments_insert
-- (001) bit-for-bit (ten sam poziom ról: owner/admin/developer/tester do
-- wstawiania, kazdy czlonek projektu do odczytu). DELETE jest SZERSZY niz
-- task_comments_delete (tam tylko autor) - zalacznik jest blizej pliku
-- projektu niz osobistego komentarza, wiec owner/admin moze posprzatac
-- cudzy zalacznik, oprocz tego ze autor moze usunac swoj wlasny.
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.task_attachments (
    id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id      uuid        NOT NULL,
    name         text        NOT NULL CHECK (length(trim(name)) > 0),
    storage_path text        NOT NULL,
    size_bytes   bigint,
    mime_type    text,
    uploaded_by  uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_attachments
DROP CONSTRAINT IF EXISTS task_attachments_task_id_fkey;

ALTER TABLE public.task_attachments
    ADD CONSTRAINT task_attachments_task_id_fkey
        FOREIGN KEY (task_id)
            REFERENCES public.tasks(id)
            ON DELETE CASCADE;

ALTER TABLE public.task_attachments
DROP CONSTRAINT IF EXISTS task_attachments_uploaded_by_fkey;

ALTER TABLE public.task_attachments
    ADD CONSTRAINT task_attachments_uploaded_by_fkey
        FOREIGN KEY (uploaded_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_attachments_task
    ON public.task_attachments(task_id);


ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS task_attachments_select ON public.task_attachments;
CREATE POLICY task_attachments_select
ON public.task_attachments
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_attachments.task_id
          AND private.project_access(t.project_id)
    )
);

DROP POLICY IF EXISTS task_attachments_insert ON public.task_attachments;
CREATE POLICY task_attachments_insert
ON public.task_attachments
FOR INSERT
TO authenticated
WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_attachments.task_id
          AND private.project_role(t.project_id) IN (
              'owner', 'admin', 'developer', 'tester'
          )
    )
);

DROP POLICY IF EXISTS task_attachments_delete ON public.task_attachments;
CREATE POLICY task_attachments_delete
ON public.task_attachments
FOR DELETE
TO authenticated
USING (
    uploaded_by = (SELECT auth.uid())
    OR EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.id = task_attachments.task_id
          AND private.project_role(t.project_id) IN ('owner', 'admin')
    )
);


GRANT SELECT, INSERT, DELETE ON public.task_attachments TO authenticated;


COMMIT;
```

- [ ] **Step 2: Register the migration in the README index**

In `src/db/migrations/README.md`, add a row after the last migration row in the table:

```markdown
| `041_task_attachments.sql` | New table `task_attachments` (`task_id` FK `ON DELETE CASCADE`, no `project_id` column - derived via `task_id`). Wires up the already-existing but previously unused `uploadTaskAttachment`/`deleteTaskAttachment` storage helpers (`src/lib/storage/storage.ts`) and `STORAGE_BUCKETS.ATTACHMENTS`. RLS select/insert mirror `task_comments` exactly; delete is broader (uploader OR project owner/admin, not author-only). | Attaching files to a task from the task detail dialog |
```

- [ ] **Step 3: Add the compat-test section**

In `tests/db/compat.test.mjs`, insert a new section after the last existing section and before the final `console.log`/`process.exit` lines:

```js
// ------------------------------------------------------------------
section("29. task_attachments: RLS mirrors task_comments + szersze DELETE (migracja 041)");

let attachmentTaskId;
await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.tasks (project_id, title) VALUES ($1, 'Task dla zalacznikow') RETURNING id",
    [projectId]
  );
  attachmentTaskId = rows[0].id;
});

await expectRejected(
  "B (spoza projektu) nie moze wstawic zalacznika",
  () =>
    withUser(B, () =>
      db.query(
        "INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by) VALUES ($1, 'x.txt', 'path/x.txt', $2)",
        [attachmentTaskId, B]
      )
    ),
  /permission denied|new row violates/i
);

let attachmentId;
await withUser(A, async () => {
  const { rows } = await db.query(
    `INSERT INTO public.task_attachments (task_id, name, storage_path, size_bytes, mime_type, uploaded_by)
     VALUES ($1, 'plan.txt', 'projects/p/tasks/t/a/1.txt', 42, 'text/plain', $2)
     RETURNING id, name`,
    [attachmentTaskId, A]
  );
  attachmentId = rows[0]?.id;
  check("wlasciciel projektu moze wstawic zalacznik", rows[0]?.name === "plan.txt", JSON.stringify(rows));
});

await withUser(B, async () => {
  const { rows } = await db.query("SELECT id FROM public.task_attachments WHERE id = $1", [attachmentId]);
  check("B (spoza projektu) nie widzi zalacznika", rows.length === 0, rows.length);
});

await withUser(A, async () => {
  const { rows } = await db.query("SELECT id, name FROM public.task_attachments WHERE task_id = $1", [
    attachmentTaskId,
  ]);
  check("czlonek projektu widzi zalacznik", rows.length === 1 && rows[0].name === "plan.txt", JSON.stringify(rows));
});

await withUser(A, async () => {
  const result = await db.query("DELETE FROM public.task_attachments WHERE id = $1 RETURNING id", [attachmentId]);
  check(
    "owner projektu moze usunac cudzy zalacznik (szersze niz task_comments)",
    result.rows.length === 1,
    JSON.stringify(result.rows)
  );
});

await withUser(A, async () => {
  const { rows } = await db.query(
    "INSERT INTO public.task_attachments (task_id, name, storage_path, uploaded_by) VALUES ($1, 'cascade.txt', 'path/cascade.txt', $2) RETURNING id",
    [attachmentTaskId, A]
  );
  const attId = rows[0].id;
  await db.query("DELETE FROM public.tasks WHERE id = $1", [attachmentTaskId]);
  const { rows: remaining } = await db.query("SELECT id FROM public.task_attachments WHERE id = $1", [attId]);
  check("usuniecie taska kasuje jego zalaczniki (ON DELETE CASCADE)", remaining.length === 0, remaining.length);
});
```

- [ ] **Step 4: Run the DB compat suite**

Run: `npm run test:db`
Expected: count grows by exactly 6 from whatever the pre-existing baseline is (183 as of this plan's writing - confirm the actual number rather than assuming), 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/041_task_attachments.sql src/db/migrations/README.md tests/db/compat.test.mjs
git commit -m "Add migration 041: task_attachments table with task_comments-style RLS"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 2: ActivityAction literals + action-config entries

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/app/projects/[id]/activity/action-config.ts`

- [ ] **Step 1: Add two literals to the `ActivityAction` union**

In `src/types/api.ts`, find the `ActivityAction` union (it has `"file_uploaded"` and `"file_deleted"` among its members) and add two new members right after those two:

```ts
  | "file_uploaded"
  | "file_deleted"
  | "task_attachment_uploaded"
  | "task_attachment_deleted"
```

- [ ] **Step 2: Add matching entries to `ACTION_CONFIG`**

`ACTION_CONFIG` in `src/app/projects/[id]/activity/action-config.ts` is typed `Record<ActivityAction, ActionConfig>` - the file will not compile until every union member has an entry. Add these two, right after the existing `file_uploaded`/`file_deleted` entries, matching this file's plain-English-label convention (not i18n - this file has no translated labels for any action today):

```ts
  file_uploaded: { label: "File uploaded", icon: FileText, color: "text-success" },
  file_deleted: { label: "File deleted", icon: Trash2, color: "text-destructive" },
  task_attachment_uploaded: { label: "Attachment uploaded", icon: FileText, color: "text-success" },
  task_attachment_deleted: { label: "Attachment deleted", icon: Trash2, color: "text-destructive" },
```

(`FileText`/`Trash2` are already imported in this file - no new import needed.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `ACTION_CONFIG` still errors, you missed a union member - the compiler error will name it.

- [ ] **Step 4: Commit**

```bash
git add src/types/api.ts "src/app/projects/[id]/activity/action-config.ts"
git commit -m "Add task_attachment_uploaded/deleted activity actions"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 3: Server Actions (`attachments-actions.ts`)

**Files:**
- Create: `src/app/projects/[id]/work/attachments-actions.ts`

- [ ] **Step 1: Write the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { canCommentOnProject, canManageProject, getProjectAccess } from "@/lib/data/project-access";
import { hasDirectDatabase } from "@/lib/db/pool";
import { withUser } from "@/lib/db/session";
import { logActivity } from "@/lib/data/log-activity";
import {
  deleteTaskAttachment as deleteStoredAttachment,
  getOrganizationStorageUsage,
  getSignedUrl,
  uploadTaskAttachment as uploadStoredAttachment,
} from "@/lib/storage/storage";
import { STORAGE_BUCKETS } from "@/lib/storage/storage-constants";
import { getOrgPlanLimits, isStorageLimitReached } from "@/lib/limits";

export type TaskAttachment = {
  id: string;
  task_id: string;
  name: string;
  size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

const ATTACHMENT_COLUMNS = "id, task_id, name, size_bytes, mime_type, uploaded_by, created_at";

export async function loadTaskAttachments(
  projectId: string,
  taskId: string
): Promise<{ attachments: TaskAttachment[]; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { attachments: [], error: "You do not have access to this project." };

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `SELECT ${ATTACHMENT_COLUMNS} FROM task_attachments WHERE task_id = $1 ORDER BY created_at DESC`,
          [taskId]
        )
      );
      return { attachments: result.rows, error: null };
    } catch (error) {
      return { attachments: [], error: error instanceof Error ? error.message : "Failed to load attachments." };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) return { attachments: [], error: error.message };
  return { attachments: (data ?? []) as TaskAttachment[], error: null };
}

/**
 * File bytes travel through the Server Action body, same reasoning as
 * files/actions.ts's uploadFile: the browser cannot write to local-disk
 * storage directly, only the server can. next.config.ts's Server Action
 * body limit (30MB) already covers this.
 */
export async function uploadTaskAttachment(
  projectId: string,
  taskId: string,
  formData: FormData
): Promise<{ attachment: TaskAttachment | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  // Mirrors task_attachments_insert (041): owner/admin/developer/tester -
  // the same tier as commenting on a task.
  if (!access || !canCommentOnProject(access.role)) {
    return { attachment: null, error: "You do not have permission to attach files to this task." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { attachment: null, error: "No file selected." };
  }

  if (!hasDirectDatabase()) {
    const { planName, storageLimitBytes } = await getOrgPlanLimits(access.project.organization_id);
    const currentUsage = await getOrganizationStorageUsage(access.project.organization_id);

    if (isStorageLimitReached(currentUsage + file.size, storageLimitBytes)) {
      return {
        attachment: null,
        error: `This upload would exceed your ${planName} plan's storage limit. Upgrade your plan to raise this limit.`,
      };
    }
  }

  let uploaded: { path: string };
  try {
    uploaded = await uploadStoredAttachment(projectId, taskId, file, access.userId);
  } catch (uploadError) {
    return { attachment: null, error: uploadError instanceof Error ? uploadError.message : "Upload failed." };
  }

  let attachment: TaskAttachment;

  if (hasDirectDatabase()) {
    try {
      const result = await withUser(access.userId, ({ query }) =>
        query(
          `INSERT INTO task_attachments (task_id, name, storage_path, size_bytes, mime_type, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING ${ATTACHMENT_COLUMNS}`,
          [taskId, file.name, uploaded.path, file.size, file.type || "application/octet-stream", access.userId]
        )
      );
      attachment = result.rows[0] as TaskAttachment;
    } catch (error) {
      return { attachment: null, error: error instanceof Error ? error.message : "Failed to save attachment." };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("task_attachments")
      .insert({
        task_id: taskId,
        name: file.name,
        storage_path: uploaded.path,
        size_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
        uploaded_by: access.userId,
      })
      .select(ATTACHMENT_COLUMNS)
      .single();

    if (error) return { attachment: null, error: error.message };
    attachment = data as TaskAttachment;
  }

  await logActivity({
    userId: access.userId,
    action: "task_attachment_uploaded",
    projectId,
    entityType: "task",
    entityId: taskId,
    details: { name: file.name },
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { attachment, error: null };
}

/**
 * Scoped by `id AND task_id`, storage_path taken only from the deleted
 * row's own RETURNING/select - never a client-supplied path. Same fix
 * class files/actions.ts's deleteFile documents (TODO.md §29): a caller
 * could otherwise delete or read any attachment in the whole instance by
 * guessing/reusing an id, independent of which task they actually manage.
 */
export async function deleteTaskAttachment(
  projectId: string,
  taskId: string,
  attachmentId: string
): Promise<{ error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { error: "You do not have permission to delete this attachment." };

  let storagePath: string | null;

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query("DELETE FROM task_attachments WHERE id = $1 AND task_id = $2 RETURNING storage_path", [
        attachmentId,
        taskId,
      ])
    );
    if (result.rows.length === 0) {
      return { error: "Attachment not found, or you do not have permission to delete it." };
    }
    storagePath = result.rows[0].storage_path;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("task_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("task_id", taskId)
      .select("storage_path")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!data) return { error: "Attachment not found, or you do not have permission to delete it." };
    storagePath = data.storage_path;
  }

  try {
    if (storagePath) await deleteStoredAttachment(storagePath);
  } catch (deleteError) {
    return { error: deleteError instanceof Error ? deleteError.message : "Delete failed." };
  }

  await logActivity({
    userId: access.userId,
    action: "task_attachment_deleted",
    projectId,
    entityType: "task",
    entityId: taskId,
  });

  revalidatePath(`/projects/${projectId}/work`);
  return { error: null };
}

/**
 * Provider-agnostic download link, same reasoning as files/actions.ts's
 * getDownloadUrl: works whether the bucket is Supabase Storage or the
 * local filesystem (which the browser cannot reach directly). Takes
 * attachmentId, not a raw storagePath, and looks the path up scoped to
 * task_id - see deleteTaskAttachment's own comment for why.
 */
export async function getTaskAttachmentDownloadUrl(
  projectId: string,
  taskId: string,
  attachmentId: string
): Promise<{ url: string | null; error: string | null }> {
  const access = await getProjectAccess(projectId);
  if (!access) return { url: null, error: "You do not have access to this project." };

  let storagePath: string | null;

  if (hasDirectDatabase()) {
    const result = await withUser(access.userId, ({ query }) =>
      query("SELECT storage_path FROM task_attachments WHERE id = $1 AND task_id = $2", [attachmentId, taskId])
    );
    storagePath = result.rows[0]?.storage_path ?? null;
  } else {
    const supabase = await createClient();
    const { data, error: lookupError } = await supabase
      .from("task_attachments")
      .select("storage_path")
      .eq("id", attachmentId)
      .eq("task_id", taskId)
      .maybeSingle();

    if (lookupError) return { url: null, error: lookupError.message };
    storagePath = data?.storage_path ?? null;
  }

  if (!storagePath) return { url: null, error: "Attachment not found in this task." };

  try {
    const url = await getSignedUrl(STORAGE_BUCKETS.ATTACHMENTS, storagePath);
    return { url, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Failed to create download link." };
  }
}

// canManageProject is re-exported for the UI's delete-button gating (owner/admin can delete any attachment; the uploader can delete their own regardless of role - see task_attachments_delete's RLS policy).
export { canManageProject };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `uploadTaskAttachment`/`deleteTaskAttachment` names collide with the storage-layer imports, confirm the `as uploadStoredAttachment`/`as deleteStoredAttachment` aliases in the import statement are exactly as shown above.

- [ ] **Step 3: Commit**

```bash
git add "src/app/projects/[id]/work/attachments-actions.ts"
git commit -m "Add Server Actions for task attachments (upload/delete/list/download)"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 4: UI section (`task-attachments-section.tsx`) + i18n

**Files:**
- Create: `src/components/work/task-attachments-section.tsx`
- Modify: `messages/en.json`, `messages/pl.json`, `messages/de.json`, `messages/es.json`

- [ ] **Step 1: Add the `work.attachment*` i18n keys to all four files**

Add these keys to the existing `"work"` namespace in each of the four `messages/*.json` files (flat per-language values, same convention as every other addition this session; each language gets only its own strings, not this combined table):

| Key | en | pl | de | es |
|---|---|---|---|---|
| `attachments` | Attachments | Załączniki | Anhänge | Archivos adjuntos |
| `attachTaskFile` | Attach a file | Załącz plik | Datei anhängen | Adjuntar archivo |
| `uploadingAttachment` | Uploading... | Przesyłanie... | Wird hochgeladen... | Subiendo... |
| `noAttachmentsYet` | No files attached yet. | Jeszcze nie ma załączonych plików. | Noch keine Dateien angehängt. | Aún no hay archivos adjuntos. |
| `loadingAttachments` | Loading attachments... | Wczytywanie załączników... | Anhänge werden geladen... | Cargando archivos adjuntos... |
| `downloadAttachmentAria` | Download {name} | Pobierz {name} | {name} herunterladen | Descargar {name} |
| `deleteAttachmentAria` | Delete {name} | Usuń {name} | {name} löschen | Eliminar {name} |
| `failedToLoadAttachments` | Failed to load attachments. | Nie udało się wczytać załączników. | Anhänge konnten nicht geladen werden. | No se pudieron cargar los archivos adjuntos. |
| `failedToUploadAttachment` | Failed to upload the file. | Nie udało się przesłać pliku. | Die Datei konnte nicht hochgeladen werden. | No se pudo subir el archivo. |
| `failedToDeleteAttachment` | Failed to delete the attachment. | Nie udało się usunąć załącznika. | Der Anhang konnte nicht gelöscht werden. | No se pudo eliminar el archivo adjunto. |
| `failedToGetDownloadLink` | Could not create a download link. | Nie udało się utworzyć linku do pobrania. | Der Download-Link konnte nicht erstellt werden. | No se pudo crear el enlace de descarga. |

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
import { Download, FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteTaskAttachment,
  getTaskAttachmentDownloadUrl,
  loadTaskAttachments,
  uploadTaskAttachment,
  type TaskAttachment,
} from "@/app/projects/[id]/work/attachments-actions";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Self-contained, same shape as TaskAttemptsSection: loads its own data on
 * mount, owns its own upload/delete state, doesn't touch the parent
 * dialog's form state.
 */
export function TaskAttachmentsSection({
  projectId,
  taskId,
  canUpload,
  currentUserId,
  canManageProject,
}: {
  projectId: string;
  taskId: string;
  canUpload: boolean;
  currentUserId: string | null;
  /** Owner/admin can delete any attachment; anyone can delete their own (task_attachments_delete's actual RLS boundary - this only controls the button, RLS still re-checks server-side). */
  canManageProject: boolean;
}) {
  const t = useTranslations("work");
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      const result = await loadTaskAttachments(projectId, taskId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else setAttachments(result.attachments);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  const handleFileChosen = async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadTaskAttachment(projectId, taskId, formData);
      if (result.error || !result.attachment) throw new Error(result.error ?? t("failedToUploadAttachment"));

      setAttachments((current) => [result.attachment as TaskAttachment, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToUploadAttachment"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (attachmentId: string) => {
    setDeletingId(attachmentId);
    setError(null);

    try {
      const result = await deleteTaskAttachment(projectId, taskId, attachmentId);
      if (result.error) throw new Error(result.error);

      setAttachments((current) => current.filter((a) => a.id !== attachmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToDeleteAttachment"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (attachmentId: string) => {
    setError(null);
    const result = await getTaskAttachmentDownloadUrl(projectId, taskId, attachmentId);
    if (result.error || !result.url) {
      setError(result.error ?? t("failedToGetDownloadLink"));
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  return (
    <section aria-label={t("attachments")} className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          {t("attachments")}
          {attachments.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{attachments.length}</span>
          )}
        </h3>
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFileChosen(file);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              {uploading ? t("uploadingAttachment") : t("attachTaskFile")}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("loadingAttachments")}
        </p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAttachmentsYet")}</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((attachment) => {
            const canDelete = canManageProject || attachment.uploaded_by === currentUserId;
            return (
              <li
                key={attachment.id}
                className="group flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(attachment.size_bytes)}</span>
                <button
                  type="button"
                  aria-label={t("downloadAttachmentAria", { name: attachment.name })}
                  onClick={() => void handleDownload(attachment.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {canDelete && (
                  <button
                    type="button"
                    aria-label={t("deleteAttachmentAria", { name: attachment.name })}
                    disabled={deletingId === attachment.id}
                    onClick={() => void handleDelete(attachment.id)}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-60"
                  >
                    {deletingId === attachment.id ? (
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
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/task-attachments-section.tsx messages/en.json messages/pl.json messages/de.json messages/es.json
git commit -m "Add TaskAttachmentsSection UI and its i18n keys"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

### Task 5: Wire into `task-detail-dialog.tsx`, final verification

**Files:**
- Modify: `src/components/work/task-detail-dialog.tsx`

- [ ] **Step 1: Import and render the section**

In `src/components/work/task-detail-dialog.tsx`, add the import next to the existing `TaskAttemptsSection` import:

```ts
import { TaskAttachmentsSection } from "@/components/work/task-attachments-section";
```

Find where `<TaskAttemptsSection ... />` is rendered (it takes `projectId`, `taskId`, `canEdit`, `canDelete` props - read the actual call site to match its exact prop names for `projectId`/`task.id`). Render `<TaskAttachmentsSection>` immediately after it, passing:

```tsx
<TaskAttachmentsSection
  projectId={projectId}
  taskId={task.id}
  canUpload={canEdit}
  currentUserId={currentUserId}
  canManageProject={canDelete}
/>
```

(`canDelete` on `TaskDetailDialog` is already `role === "owner" || role === "admin"` per `work-board.tsx`'s derivation - exactly the tier `TaskAttachmentsSection`'s `canManageProject` prop needs, so it can be passed straight through with no new prop threading through `WorkBoard`/`CalendarView`.)

- [ ] **Step 2: Type-check, lint, build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: does not exceed the established baseline (check the actual current count; it has stayed at or below 3 for most of this session's later work); none in files this plan touched.

Run: `npm run test:db`
Expected: same count as Task 1 left it, 0 fail.

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Real-browser verification against the PGlite harness**

There is no `.env.local`, but self-hosted mode's `local` `StorageProvider` writes to the filesystem, so a full upload/download/delete round trip CAN be exercised for real (unlike the earlier AI-chat plan's LLM-call limitation). Using this session's established PGlite-behind-TCP + `next start` harness: log in, open a task, upload a real small file through the UI, confirm it appears in the list with the right name/size, click download and confirm the file's bytes come back correctly, delete it and confirm it disappears from the list AND that a second `loadTaskAttachments` call (e.g. a page reload) no longer returns it. Also verify the empty state renders for a task with none, and that a project member without write access does not see the upload button (`canUpload={false}` path).

- [ ] **Step 4: Commit**

```bash
git add src/components/work/task-detail-dialog.tsx
git commit -m "Wire TaskAttachmentsSection into the task detail dialog"
```
Append: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

---

## Self-Review

**Spec coverage:** migration + RLS (Task 1) ✓, `ActivityAction`/`action-config` (Task 2) ✓, Server Actions mirroring `files/actions.ts`'s security pattern exactly - id+task_id scoping, no client-supplied storage_path (Task 3) ✓, UI section + i18n (Task 4) ✓, dialog wiring (Task 5) ✓. Known body-size-limit inconsistency documented in the spec as an explicit non-fix, not silently dropped.

**Type consistency:** `TaskAttachment` (Task 3) fields match exactly what Task 4's component reads (`id, task_id, name, size_bytes, mime_type, uploaded_by, created_at`). Function names (`loadTaskAttachments`, `uploadTaskAttachment`, `deleteTaskAttachment`, `getTaskAttachmentDownloadUrl`) match between Task 3's exports and Task 4's imports exactly.

**Placeholder scan:** none - every step has real code, real SQL, or an exact command with expected output.
