-- ============================================================
-- GUIDON - MIGRACJA 048
-- Moodboard / referencje projektu (project_references)
-- ============================================================
--
-- Uruchomic PO 047.
--
-- KONTEKST
-- --------
-- Sekcja projektu na obrazy referencyjne i concept arty (Wiedza ->
-- Moodboard): obraz + podpis + tagi + opcjonalny link zrodlowy. Pliki leza
-- w kubelku STORAGE_BUCKETS.FILES pod projects/<id>/references/..., ta
-- tabela trzyma metadane (jak project_files / task_attachments).
--
-- Tylko obrazy (mime_type image/*) - to galeria, nie druga biblioteka
-- dokumentow; zwykle pliki dalej ida do Files.
--
-- RLS (jak task_attachments, 041):
--   SELECT  kazdy z dostepem do projektu (private.project_access)
--   INSERT  owner/admin/developer/tester, uploaded_by = auth.uid()
--   UPDATE  autor albo owner/admin - i TYLKO kolumny caption, tags,
--           source_url (GRANT kolumnowy, jak projects w 023/029), zeby
--           UPDATE nie mogl przepiac wiersza do innego projektu ani
--           podmienic storage_path na cudzy plik
--   DELETE  autor albo owner/admin
--
-- Rozmiar wlicza sie do limitu storage organizacji
-- (getOrganizationStorageUsage w src/lib/storage/storage.ts).
-- ============================================================

BEGIN;


CREATE TABLE IF NOT EXISTS public.project_references (
    id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id   uuid        NOT NULL,
    name         text        NOT NULL CHECK (length(trim(name)) > 0),
    storage_path text        NOT NULL,
    size_bytes   bigint,
    mime_type    text        NOT NULL CHECK (mime_type LIKE 'image/%'),
    caption      text,
    tags         text[]      NOT NULL DEFAULT '{}',
    source_url   text,
    uploaded_by  uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_references
DROP CONSTRAINT IF EXISTS project_references_project_id_fkey;

ALTER TABLE public.project_references
    ADD CONSTRAINT project_references_project_id_fkey
        FOREIGN KEY (project_id)
            REFERENCES public.projects(id)
            ON DELETE CASCADE;

ALTER TABLE public.project_references
DROP CONSTRAINT IF EXISTS project_references_uploaded_by_fkey;

ALTER TABLE public.project_references
    ADD CONSTRAINT project_references_uploaded_by_fkey
        FOREIGN KEY (uploaded_by)
            REFERENCES public.profiles(id)
            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_references_project
    ON public.project_references(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_references_uploaded_by
    ON public.project_references(uploaded_by);


ALTER TABLE public.project_references ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS project_references_select ON public.project_references;
CREATE POLICY project_references_select
ON public.project_references
FOR SELECT
TO authenticated
USING (private.project_access(project_id));

DROP POLICY IF EXISTS project_references_insert ON public.project_references;
CREATE POLICY project_references_insert
ON public.project_references
FOR INSERT
TO authenticated
WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND private.project_role(project_id) IN ('owner', 'admin', 'developer', 'tester')
);

DROP POLICY IF EXISTS project_references_update ON public.project_references;
CREATE POLICY project_references_update
ON public.project_references
FOR UPDATE
TO authenticated
USING (
    uploaded_by = (SELECT auth.uid())
    OR private.project_role(project_id) IN ('owner', 'admin')
)
WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    OR private.project_role(project_id) IN ('owner', 'admin')
);

DROP POLICY IF EXISTS project_references_delete ON public.project_references;
CREATE POLICY project_references_delete
ON public.project_references
FOR DELETE
TO authenticated
USING (
    uploaded_by = (SELECT auth.uid())
    OR private.project_role(project_id) IN ('owner', 'admin')
);


REVOKE ALL ON public.project_references FROM anon;
GRANT SELECT, INSERT, DELETE ON public.project_references TO authenticated;
GRANT UPDATE (caption, tags, source_url) ON public.project_references TO authenticated;


COMMIT;
