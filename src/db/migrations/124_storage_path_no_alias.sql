-- ============================================================
-- GUIDON - MIGRACJA 124
-- Jeden obiekt w storage = jeden wiersz (bez aliasów ścieżki)
-- ============================================================
--
-- Uruchomić PO 123.
--
-- 077 wymaga, żeby storage_path leżał w projekcie wiersza, ale nie
-- zabrania dwóm wierszom wskazywać tego samego obiektu. storage_path widzi
-- każdy członek projektu, więc tester mógł przez PostgREST dodać własny
-- załącznik albo referencję ze ścieżką cudzego pliku, a potem usunąć swój
-- wiersz - aplikacja kasuje obiekt spod storage_path kluczem service role
-- (deleteTaskAttachment/deleteReference), więc znikał plik, którego RLS
-- nie pozwala mu usunąć (project_files_delete: owner/admin; załączniki:
-- uploader lub owner/admin).
--
-- Teraz nowy wiersz nie może wskazać ścieżki, którą ma już inny wiersz w
-- task_attachments, project_files albo project_references (wspólne buckety,
-- więc sprawdzane są wszystkie trzy). Aplikacja zawsze tworzy nową,
-- unikalną ścieżkę przy uploadzie, więc normalne zapisy nic nie czują.
-- UPDATE storage_path blokuje już GRANT kolumnowy, ale trigger obejmuje go
-- też (obrona w głąb). Stare wiersze zostają, jak są.
-- ============================================================

BEGIN;


CREATE INDEX IF NOT EXISTS task_attachments_storage_path_idx ON public.task_attachments (storage_path);
CREATE INDEX IF NOT EXISTS project_files_storage_path_idx ON public.project_files (storage_path);
CREATE INDEX IF NOT EXISTS project_references_storage_path_idx ON public.project_references (storage_path);

CREATE OR REPLACE FUNCTION private.check_storage_path_not_shared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.storage_path IS NULL THEN
        RETURN NEW;
    END IF;

    -- SECURITY DEFINER: the check must see rows the inserter's RLS hides.
    IF EXISTS (SELECT 1 FROM public.task_attachments a
               WHERE a.storage_path = NEW.storage_path
                 AND NOT (TG_TABLE_NAME = 'task_attachments' AND a.id = NEW.id))
       OR EXISTS (SELECT 1 FROM public.project_files f
                  WHERE f.storage_path = NEW.storage_path
                    AND NOT (TG_TABLE_NAME = 'project_files' AND f.id = NEW.id))
       OR EXISTS (SELECT 1 FROM public.project_references r
                  WHERE r.storage_path = NEW.storage_path
                    AND NOT (TG_TABLE_NAME = 'project_references' AND r.id = NEW.id)) THEN
        RAISE EXCEPTION 'storage_path already belongs to another file'
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.check_storage_path_not_shared() FROM PUBLIC;

DROP TRIGGER IF EXISTS check_storage_path_not_shared ON public.task_attachments;
CREATE TRIGGER check_storage_path_not_shared
    BEFORE INSERT OR UPDATE OF storage_path ON public.task_attachments
    FOR EACH ROW EXECUTE FUNCTION private.check_storage_path_not_shared();

DROP TRIGGER IF EXISTS check_storage_path_not_shared ON public.project_files;
CREATE TRIGGER check_storage_path_not_shared
    BEFORE INSERT OR UPDATE OF storage_path ON public.project_files
    FOR EACH ROW EXECUTE FUNCTION private.check_storage_path_not_shared();

DROP TRIGGER IF EXISTS check_storage_path_not_shared ON public.project_references;
CREATE TRIGGER check_storage_path_not_shared
    BEFORE INSERT OR UPDATE OF storage_path ON public.project_references
    FOR EACH ROW EXECUTE FUNCTION private.check_storage_path_not_shared();


COMMIT;
