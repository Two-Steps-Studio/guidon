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
