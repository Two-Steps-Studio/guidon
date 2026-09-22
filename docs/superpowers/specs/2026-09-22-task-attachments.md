# Task attachments

**Status:** approved by user (2026-09-22). Architecture confirmed directly: new `task_attachments` table + the existing `StorageProvider`/`storage.ts` abstraction (already has working `uploadTaskAttachment`/`deleteTaskAttachment` helpers and a reserved `STORAGE_BUCKETS.ATTACHMENTS` bucket — both unused until now).

## What exists already

- `src/lib/storage/storage.ts`: `uploadTaskAttachment(projectId, taskId, file, userId)` and `deleteTaskAttachment(storagePath)` — validate extension (`ALLOWED_FILE_EXTENSIONS`) and size (`FILE_SIZE_LIMITS.ATTACHMENT`, 50MB), write to `STORAGE_BUCKETS.ATTACHMENTS` at `projects/{projectId}/tasks/{taskId}/{userId}/{timestamp}.{ext}`. Both fully working, currently called from nowhere.
- `src/app/projects/[id]/files/actions.ts`: the exact pattern to mirror for `project_files` — `uploadFile`/`deleteFile`/`getDownloadUrl` Server Actions, each scoping a mutation by `id AND project_id` (never trusting a client-supplied `storage_path` — see that file's own documented security-audit fix, `TODO.md §29`). Task attachments repeat this pattern scoped by `id AND task_id` instead.

## Data model (migration 041)

```sql
CREATE TABLE public.task_attachments (
    id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id      uuid        NOT NULL,
    name         text        NOT NULL CHECK (length(trim(name)) > 0),
    storage_path text        NOT NULL,
    size_bytes   bigint,
    mime_type    text,
    uploaded_by  uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);
```

No `category` column — unlike `project_files`, this bucket/table exists purely for "attach a file to this task," not a categorized document library. `task_id` FK `ON DELETE CASCADE` (an attachment has no meaning once its task is gone — matches `task_comments`' own FK). No `project_id` column: it's derivable via `task_id`'s own `project_id` (one join), same shape as `task_comments`; RLS and every Server Action re-derive it through that join, exactly like `task_comments_insert`/`task_comments_select` already do.

RLS policies (read the actual `task_comments`/`project_files` policies in `001_initial_schema.sql`/`021_github_integration.sql` before implementing, to match their exact SQL shape — the roles below are the decided policy, not a guess to re-derive):
- `SELECT`: any project member can see a task's attachments (`private.project_access` via the task's project) — matches `task_comments_select`.
- `INSERT`: owner/admin/developer/tester, `uploaded_by = auth.uid()` enforced in the `WITH CHECK` — matches `task_comments_insert`'s role tier and self-attribution pattern exactly (attaching a file to a task you can work on is a comment-tier action, not a manage-tier one).
- `DELETE`: **broader than `task_comments_delete`** (which is author-only) — an attachment is closer to a project file than a personal comment, so a project owner/admin can clean up any attachment regardless of who uploaded it, in addition to the uploader removing their own. `USING (uploaded_by = (SELECT auth.uid()) OR private.project_role(<the task's project_id, via a join>) IN ('owner', 'admin'))`.

## Server Actions (new file: `src/app/projects/[id]/work/attachments-actions.ts`)

- `uploadTaskAttachment(projectId, taskId, _prevState, formData)`: `useActionState`-shaped like `files/actions.ts`'s `uploadFile`. Checks `canCommentOnProject` (matches the RLS insert tier above — reuse whichever check matches the actual RLS policy chosen). Reads `formData.get("file")`, calls the existing storage-layer `uploadTaskAttachment(projectId, taskId, file, userId)`, inserts the `task_attachments` row (both `hasDirectDatabase()`/Supabase branches), `logActivity` (`action: "task_attachment_uploaded"` — new `ActivityAction` literal, add it to `src/types/api.ts`'s union and to `action-config.tsx`'s icon/label map next to the other `task_*` entries), `revalidatePath`.
- `deleteTaskAttachment(projectId, taskId, attachmentId)`: scoped delete `WHERE id = $1 AND task_id = $2` (never a client-supplied `storage_path`, same fix class as `files/actions.ts`'s documented one), `RETURNING storage_path`, then calls the existing `deleteTaskAttachment(storagePath)` storage helper, `logActivity`, `revalidatePath`.
- `loadTaskAttachments(projectId, taskId)`: plain read, same access check as `loadComments`.
- `getTaskAttachmentDownloadUrl(projectId, taskId, attachmentId)`: mirrors `files/actions.ts`'s `getDownloadUrl`, using `STORAGE_BUCKETS.ATTACHMENTS` instead of `.FILES`.

Storage limit check: unlike `files/actions.ts`'s `uploadFile` (which checks the org's plan storage limit before uploading), task attachments count toward the same org storage total — reuse `getOrgPlanLimits`/`isStorageLimitReached`/`getOrganizationStorageUsage` identically.

## UI (`src/components/work/task-detail-dialog.tsx`)

A new "Attachments" section, positioned like the existing "Previous Attempts"/comments sections (own collapsible-or-always-visible block, follow whichever pattern `TaskAttemptsSection` already uses for consistency): a compact list (name, size, uploader initials, download link, a delete button gated by the same `canDelete`-tier prop the dialog already receives) plus a file `<input type="file">` + upload button using a `useActionState`-driven form, following `ApiKeysSection`'s/`files-browser.tsx`'s existing upload-progress/error UI conventions exactly (spinner while uploading, inline error banner, no page reload).

## i18n

New `work.attachment*` keys (title, upload button, empty state, uploading, delete confirm/button, download, file-too-large/unsupported-extension errors reusing the storage layer's own thrown messages where possible) across all four `messages/*.json` files, same process as every other i18n addition this session (flat per-language values, identical key sets, CRLF preserved).

## Known limitation (not fixed here)

`next.config.ts`'s Server Action body limit is 30MB, but `FILE_SIZE_LIMITS.ATTACHMENT` claims 50MB — an attachment between 30–50MB hits Next's own (less friendly) body-size rejection before this feature's code runs. This exact inconsistency already exists for `project_files` uploads too (harmless there only because `DOCUMENT` is 25MB, under the 30MB ceiling) — not introduced by this feature, not fixed by it either; out of scope.

## Non-goals

Inline image preview/thumbnails, drag-and-drop upload (a plain file input is enough for v1), versioning/replacing an existing attachment (delete + re-upload covers it), attachments on subtasks specifically (subtasks are plain `tasks` rows, so this works for them automatically — no special-casing needed or wanted).

## Testing

`tests/db/compat.test.mjs` new section: RLS insert/select/delete boundary checks mirroring section-style used for `task_comments`/`task_attempts` earlier in this file — a non-member gets nothing, a project member below the required role can't insert, the FK cascade-deletes attachments when their task is deleted. `npx tsc --noEmit`, `npm run lint`, `npm run build`. Storage upload/delete itself can be verified against the PGlite harness this session has used repeatedly (real DB row round-trip) even without real Supabase Storage, since self-hosted mode's `local` `StorageProvider` writes to the filesystem — verify an actual file upload, list, download-URL and delete round-trip through the running app, not just the DB row.
